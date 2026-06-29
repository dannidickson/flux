<?php

namespace Flux\Controller;

use Flux\Context\FluxContext;
use Flux\Context\FluxContextResolver;
use Flux\Service\FluxChunkedSaver;
use SilverStripe\CMS\Controllers\ContentController;
use SilverStripe\CMS\Model\SiteTree;
use SilverStripe\Control\Controller;
use SilverStripe\Control\Director;
use SilverStripe\Control\HTTPRequest;
use SilverStripe\Control\HTTPResponse;
use SilverStripe\Core\Injector\Injector;
use SilverStripe\ORM\DataObject;
use SilverStripe\Security\Permission;
use SilverStripe\Security\Security;
use SilverStripe\Security\SecurityToken;
use SilverStripe\Versioned\Versioned;
use SilverStripe\View\Parsers\ShortcodeParser;

/**
 * Flux API controller, mounted at /flux.
 *
 *   GET  /flux/context              → schema + scope lookup for the preview frame
 *   POST /flux/save                 → chunked save (DataObject → Element → Page)
 *   POST /flux/pageTemplateUpdate   → render full page with a ChangeSet applied (live preview)
 *   POST /flux/blockUpdate          → render a single Element with a ChangeSet applied
 *   POST /flux/shortcodesFragmentPatch → parse shortcodes in a value for inline preview
 *
 * All actions require admin permission. Mutating actions also require
 * a valid SecurityToken (same surface as Silverstripe admin).
 */
class FluxApiController extends Controller
{
    private static array $allowed_actions = [
        'context',
        'save',
        'pageTemplateUpdate',
        'blockUpdate',
        'shortCodesFragmentPatch',
    ];

    public function context(HTTPRequest $request): HTTPResponse
    {
        if ($denied = $this->requireAdmin()) {
            return $denied;
        }

        $class = $request->getVar('class');
        $id = (int) $request->getVar('id');
        $itemID = $request->getVar('itemID');
        $itemID = $itemID !== null && $itemID !== '' ? (int) $itemID : null;
        $relation = $request->getVar('relation') ?: null;

        if (!$class || !$id) {
            return $this->jsonError('class and id are required', 400);
        }

        if (!class_exists($class) || !is_subclass_of($class, DataObject::class)) {
            return $this->jsonError('unknown class', 400);
        }

        return Versioned::withVersionedMode(function () use ($class, $id, $itemID, $relation) {
            Versioned::set_stage(Versioned::DRAFT);

            $parent = DataObject::get_by_id($class, $id);
            if (!$parent || !$parent->exists()) {
                return $this->jsonError('record not found', 404);
            }

            $resolver = new FluxContextResolver();

            // If the caller passed both a relation name and an itemID, resolve
            // the nested item directly through the parent's relation — same
            // path FluxGridDetailFormExtension uses on the server side, so
            // both sides agree on the resulting context.
            if ($relation && $itemID) {
                if ($parent->hasMethod($relation)) {
                    $item = $parent->$relation()->byID($itemID);
                    if ($item instanceof DataObject && $item->exists()) {
                        return $this->json($resolver->forGridFieldItem($item, $parent, $relation));
                    }
                }
            }

            return $this->json($resolver->forRecord($parent, $itemID));
        });
    }

    public function save(HTTPRequest $request): HTTPResponse
    {
        if ($denied = $this->requireAdmin()) {
            return $denied;
        }
        if ($denied = $this->requireSecurityToken($request)) {
            return $denied;
        }

        $body = json_decode($request->getBody(), true);
        if (!is_array($body) || !isset($body['chunks']) || !is_array($body['chunks'])) {
            return $this->jsonError('chunks required', 400);
        }

        $result = (new FluxChunkedSaver())->save($body['chunks']);
        return $this->json($result, $result['ok'] ? 200 : 422);
    }

    /**
     * Renders the full page template with all ChangeSet entries applied.
     * Handles both Page and Element changes — Element entries are applied
     * via applyBlockUpdate() before the full page render.
     */
    public function pageTemplateUpdate(HTTPRequest $request): HTTPResponse
    {
        if ($denied = $this->requireAdmin()) {
            return $denied;
        }

        return Versioned::withVersionedMode(function () use ($request) {
            Versioned::set_stage(Versioned::DRAFT);

            $pageID = $request->getVar('pageID') ?? $request->postVar('pageID');
            $className = $request->getVar('className') ?? $request->postVar('className') ?? SiteTree::class;

            if (!$pageID) {
                return $this->jsonError('pageID is required', 400);
            }

            $liveState = json_decode($request->getBody(), true);
            $changeSet = $liveState['changeSet'] ?? [];

            $page = DataObject::get_by_id($className, $pageID);
            if (!$page) {
                return $this->jsonError('Page not found', 404);
            }

            if (isset($changeSet['Page'])) {
                $fields = $changeSet['Page']['fields'] ?? [];
                foreach ($fields as $fieldName => $value) {
                    if ($page->hasField($fieldName)) {
                        $page->$fieldName = $this->normaliseFieldValue($value);
                    }
                }
            }

            $segmentTemplateChanges = ['Elements' => []];
            if (isset($changeSet['Element'])) {
                foreach ($changeSet['Element'] as $entry) {
                    $element = $this->applyBlockUpdate($entry);
                    if ($element) {
                        $segmentTemplateChanges['Elements'][$entry['ID']] = $element->forTemplate();
                    }
                }
            }

            return $this->json([
                'pageID' => $pageID,
                'className' => $className,
                'html' => $this->renderPageTemplate($page),
                'segmentTemplateChanges' => $segmentTemplateChanges,
                'changeSet' => $changeSet,
                'trusted' => true,
            ])
                ->addHeader('X-Flux-HTML', 'true')
                ->addHeader('X-Flux-Trusted', 'true');
        });
    }

    /**
     * Renders a single block/element with ChangeSet applied.
     */
    public function blockUpdate(HTTPRequest $request): HTTPResponse
    {
        if ($denied = $this->requireAdmin()) {
            return $denied;
        }

        return Versioned::withVersionedMode(function () use ($request) {
            Versioned::set_stage(Versioned::DRAFT);

            $pageID = $request->getVar('pageID');
            $owner = $request->getVar('owner');

            if (!$pageID || !$owner) {
                return $this->jsonError('pageID and owner are required', 400);
            }

            $body = json_decode($request->getBody(), true);
            $entries = $body['changeSet']['Element'] ?? [];

            if (empty($entries)) {
                return $this->jsonError('changeSet.Element is required', 400);
            }

            $element = $this->applyBlockUpdate($entries[0]);
            if (!$element) {
                return $this->jsonError('Element not found', 404);
            }

            return $this->json([
                'pageID' => $pageID,
                'owner' => $owner,
                'html' => $element->forTemplate(),
                'trusted' => true,
            ])
                ->addHeader('X-Flux-HTML', 'true')
                ->addHeader('X-Flux-Trusted', 'true');
        });
    }

    public function shortCodesFragmentPatch(HTTPRequest $request): HTTPResponse
    {
        if ($denied = $this->requireAdmin()) {
            return $denied;
        }

        return Versioned::withVersionedMode(function () use ($request) {
            Versioned::set_stage(Versioned::DRAFT);

            $body = json_decode($request->getBody(), true);
            $value = $body['value'] ?? '';

            if (!$value) {
                return $this->jsonError('value is required', 400);
            }

            return $this->json([
                'html' => ShortcodeParser::get_active()->parse($value),
                'key' => $body['key'] ?? null,
                'owner' => $body['owner'] ?? null,
                'trusted' => true,
            ]);
        });
    }

    /**
     * Apply field changes from a ChangeSet entry to a DataObject (in-memory only).
     * Shared between pageTemplateUpdate (for Element entries) and blockUpdate.
     */
    private function applyBlockUpdate(array $entry): ?DataObject
    {
        $segmentClassName = $entry['ClassName'] ?? null;
        $segmentID = $entry['ID'] ?? null;
        $fields = $entry['fields'] ?? [];

        if (!$segmentClassName || !$segmentID) {
            return null;
        }

        $element = DataObject::get_by_id($segmentClassName, $segmentID);
        if (!$element) {
            return null;
        }

        foreach ($fields as $fieldName => $value) {
            if ($element->hasField($fieldName)) {
                $element->$fieldName = $this->normaliseFieldValue($value);
            }
        }

        return $element;
    }

    private function normaliseFieldValue(mixed $value): mixed
    {
        return is_array($value) ? implode(',', $value) : $value;
    }

    /**
     * Render a Page through its controller as the frontend would, so the
     * morphed HTML matches what a published render would produce.
     */
    private function renderPageTemplate(DataObject $dataObject): string
    {
        if (!($dataObject instanceof SiteTree)) {
            return $dataObject->forTemplate();
        }

        $controllerClass = $dataObject->getControllerName();
        if (!class_exists($controllerClass)) {
            $controllerClass = ContentController::class;
        }

        $controller = Injector::inst()->create($controllerClass, $dataObject);

        $link = $dataObject->Link();
        $relativeLink = Director::makeRelative($link) ?: '/';
        $mockRequest = new HTTPRequest('GET', $relativeLink);
        $mockRequest->setSession($this->getRequest()->getSession());
        $controller->setRequest($mockRequest);
        $controller->pushCurrent();

        try {
            $controller->doInit();
            return $controller->render();
        } catch (\Exception $e) {
            return $dataObject->forTemplate();
        } finally {
            $controller->popCurrent();
        }
    }

    private function requireAdmin(): ?HTTPResponse
    {
        $member = Security::getCurrentUser();
        if (!$member || !Permission::checkMember($member, ['CMS_ACCESS_LeftAndMain', 'CMS_ACCESS_CMSMain'])) {
            return $this->jsonError('forbidden', 403);
        }
        return null;
    }

    private function requireSecurityToken(HTTPRequest $request): ?HTTPResponse
    {
        $token = SecurityToken::inst();
        $value = $request->getHeader('X-SecurityID') ?? $request->requestVar(SecurityToken::get_default_name());
        if (!$token->check($value)) {
            return $this->jsonError('invalid security token', 400);
        }
        return null;
    }

    private function json(FluxContext|array $payload, int $status = 200): HTTPResponse
    {
        $body = $payload instanceof FluxContext ? $payload->jsonSerialize() : $payload;
        return HTTPResponse::create(json_encode($body), $status)
            ->addHeader('Content-Type', 'application/json');
    }

    private function jsonError(string $message, int $status): HTTPResponse
    {
        return $this->json(['error' => $message], $status);
    }
}
