<?php

namespace Flux\Controller;

use DOMDocument;
use DOMElement;
use DOMXPath;
use Flux\Context\FluxContext;
use Flux\Context\FluxContextResolver;
use Flux\Service\FluxChunkedSaver;
use Psr\Log\LoggerInterface;
use Psr\SimpleCache\CacheInterface;
use SilverStripe\CMS\Controllers\ContentController;
use SilverStripe\CMS\Model\SiteTree;
use SilverStripe\Control\Controller;
use SilverStripe\Control\Director;
use SilverStripe\Control\HTTPRequest;
use SilverStripe\Control\HTTPResponse;
use SilverStripe\Core\Injector\Injector;
use SilverStripe\Model\List\SS_List;
use SilverStripe\ORM\DataObject;
use SilverStripe\Security\Permission;
use SilverStripe\Security\Security;
use SilverStripe\Security\SecurityToken;
use SilverStripe\Versioned\Versioned;
use SilverStripe\View\Parsers\ShortcodeParser;
use Symfony\Component\Cache\Adapter\ArrayAdapter;
use Symfony\Component\Cache\Psr16Cache;
use Throwable;

/**
 * Flux API controller.
 * API implementation looks like '/flux/[action]'
 *
 * Each endpoint checks if it has the Admin permissions,
 * and when any data is updated it will check if there is valid security id
 *
 * @todo some of these functions could be shifted into a service or helper class
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

    /**
     * Provides clues for the frame to know what its editing
     */
    public function context(HTTPRequest $request): HTTPResponse
    {
        $denied = $this->requireAdmin();

        if ($denied) {
            return $denied;
        }

        $class = $request->getVar('class');
        $id = (int) $request->getVar('id');
        $itemID = $request->getVar('itemID');
        $relation = $request->getVar('relation');

        if ($itemID === '') {
            $itemID = null;
        }

        if ($itemID !== null) {
            $itemID = (int) $itemID;
        }

        if ($relation === '') {
            $relation = null;
        }

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

            if ($relation && $itemID) {
                $item = $this->findRelationItem($parent, $relation, $itemID);

                if ($item instanceof DataObject && $item->exists()) {
                    return $this->json($resolver->forGridFieldItem($item, $parent, $relation));
                }
            }

            return $this->json($resolver->forRecord($parent, $itemID));
        });
    }

    public function save(HTTPRequest $request): HTTPResponse
    {
        $deniedPermissions = $this->requireAdmin();

        if ($deniedPermissions) {
            return $deniedPermissions;
        }

        $deniedToken = $this->requireSecurityToken($request);

        if ($deniedToken) {
            return $deniedToken;
        }

        $body = json_decode($request->getBody(), true);

        if (!is_array($body) || !isset($body['chunks']) || !is_array($body['chunks'])) {
            return $this->jsonError('chunks required', 400);
        }

        $chunkSaver = new FluxChunkedSaver();

        $result = $chunkSaver->save($body['chunks']);

        $status = 422;

        if ($result['ok']) {
            $status = 200;
        }

        return $this->json($result, $status);
    }

    /**
     * Renders the full page template with all ChangeSet entries applied. Element entries go
     * through applyBlockUpdate() first, then get spliced into the rendered page.
     */
    public function pageTemplateUpdate(HTTPRequest $request): HTTPResponse
    {
        $denied = $this->requireAdmin();

        if ($denied) {
            return $denied;
        }

        $render = function () use ($request) {
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
                    if (!$page->hasField($fieldName)) {
                        continue;
                    }

                    $page->$fieldName = $this->normaliseFieldValue($value);
                }
            }

            $segmentTemplateChanges = ['Elements' => []];

            if (isset($changeSet['Element'])) {
                foreach ($changeSet['Element'] as $entry) {
                    $ownerTarget = null;
                    $element = $this->applyBlockUpdate($entry, $ownerTarget);

                    if (!$element) {
                        continue;
                    }

                    $segmentTemplateChanges['Elements'][$entry['ID']] = [
                        'html' => $element->forTemplate(),
                        'owner' => $ownerTarget,
                    ];
                }
            }

            $pageHtml = $this->renderPageTemplate($page);
            [$pageHtml, $spliceMisses] = $this->stitchElementFragments(
                $pageHtml,
                $segmentTemplateChanges['Elements'],
            );

            return $this->json([
                'pageID' => $pageID,
                'className' => $className,
                'html' => $pageHtml,
                'segmentTemplateChanges' => $segmentTemplateChanges,
                'spliceMisses' => $spliceMisses,
                'changeSet' => $changeSet,
                'trusted' => true,
            ])
                ->addHeader('X-Flux-HTML', 'true')
                ->addHeader('X-Flux-Trusted', 'true');
        };

        return Versioned::withVersionedMode(function () use ($render) {
            return $this->withoutPartialCache($render);
        });
    }

    /**
     * Renders a single block/element with ChangeSet applied.
     */
    public function blockUpdate(HTTPRequest $request): HTTPResponse
    {
        $deniedPermissions = $this->requireAdmin();

        if ($deniedPermissions) {
            return $deniedPermissions;
        }

        $deniedToken = $this->requireSecurityToken($request);

        if ($deniedToken) {
            return $deniedToken;
        }

        $render = function () use ($request) {
            Versioned::set_stage(Versioned::DRAFT);

            $pageID = $request->getVar('pageID');
            $owner = $request->getVar('owner');

            if (!$pageID || !$owner) {
                return $this->jsonError('pageID and owner are required', 400);
            }

            $body = json_decode($request->getBody(), true);
            $entries = $body['changeSet']['Element'] ?? [];

            if ($entries === []) {
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
        };

        return Versioned::withVersionedMode(function () use ($render) {
            return $this->withoutPartialCache($render);
        });
    }

    public function shortCodesFragmentPatch(HTTPRequest $request): HTTPResponse
    {
        $denied = $this->requireAdmin();

        if ($denied) {
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
    private function applyBlockUpdate(array $entry, ?string &$ownerTarget = null): ?DataObject
    {
        $className = $entry['ClassName'] ?? null;
        $id = $entry['ID'] ?? null;
        $fields = $entry['fields'] ?? [];

        if (!$className || !$id) {
            return null;
        }

        $element = DataObject::get_by_id($className, $id);

        if (!$element) {
            return null;
        }

        $ownerTarget = $this->ownerTargetFor($element);

        foreach ($fields as $fieldName => $value) {
            if (!$element->hasField($fieldName)) {
                continue;
            }

            $element->$fieldName = $this->normaliseFieldValue($value);
        }

        return $element;
    }

    private function ownerTargetFor(DataObject $element): string
    {
        if ($element->hasMethod('getOwnerTarget')) {
            return (string) $element->getOwnerTarget();
        }

        return '#e' . $element->ID;
    }

    /**
     * Stitch together the edited Elements markup within the full-page template
     * with the draft changes from the FluxLiveState
     */
    private function stitchElementFragments(string $pageHtml, array $elements): array
    {
        if ($elements === []) {
            return [$pageHtml, []];
        }

        $dom = new DOMDocument();
        libxml_use_internal_errors(true);
        $dom->loadHTML(
            '<?xml encoding="utf-8" ?>' . $pageHtml,
            LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD,
        );
        libxml_clear_errors();

        $changed = false;
        $misses = [];

        foreach ($elements as $id => $fragment) {
            $fragmentHtml = $fragment['html'];

            $candidates = array_values(array_unique(array_filter([
                ltrim((string) ($fragment['owner'] ?? ''), '#'),
                'e' . $id,
            ])));

            $target = $this->findElementById($dom, $candidates);

            if (!$target) {
                $misses[] = ['id' => (string) $id, 'tried' => $candidates];

                continue;
            }

            while ($target->firstChild) {
                $target->removeChild($target->firstChild);
            }

            $fragmentDom = new DOMDocument();
            libxml_use_internal_errors(true);
            $fragmentDom->loadHTML(
                '<?xml encoding="utf-8" ?><div>' . $fragmentHtml . '</div>',
                LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD,
            );
            libxml_clear_errors();

            $wrapper = $fragmentDom->getElementsByTagName('div')->item(0);

            foreach (iterator_to_array($wrapper->childNodes) as $child) {
                $target->appendChild($dom->importNode($child, true));
            }

            $changed = true;
        }

        if (!$changed) {
            return [$pageHtml, $misses];
        }

        foreach ($dom->childNodes as $node) {
            if ($node->nodeType === XML_PI_NODE) {
                $dom->removeChild($node);

                break;
            }
        }

        return [$dom->saveHTML(), $misses];
    }

    /**
     * Finds $itemID through a named relation on $parent, whatever shape that
     * relation is.
     */
    private function findRelationItem(DataObject $parent, string $relation, int $itemID): ?DataObject
    {
        if (!$parent->hasMethod($relation)) {
            return null;
        }

        $related = $parent->$relation();

        if ($related instanceof SS_List) {
            return $related->byID($itemID);
        }

        if ($related instanceof DataObject) {
            if ($related->hasMethod('Elements')) {
                return $related->Elements()->byID($itemID);
            }

            if ((int) $related->ID === $itemID) {
                return $related;
            }

            return null;
        }

        return null;
    }

    private function findElementById(DOMDocument $dom, array $ids): ?DOMElement
    {
        $xpath = new DOMXPath($dom);

        foreach ($ids as $id) {
            $match = $xpath->query(sprintf('//*[@id=%s]', $this->xpathLiteral($id)))->item(0);

            if ($match instanceof DOMElement) {
                return $match;
            }
        }

        return null;
    }

    /**
     * Quote a value for use as an XPath string literal. Anchors are title-derived
     * on many projects, so they can legitimately contain quotes.
     */
    private function xpathLiteral(string $value): string
    {
        if (!str_contains($value, "'")) {
            return "'" . $value . "'";
        }

        if (!str_contains($value, '"')) {
            return '"' . $value . '"';
        }

        return 'concat(\'' . str_replace("'", "', \"'\", '", $value) . '\')';
    }

    private function normaliseFieldValue(mixed $value): mixed
    {
        if (is_array($value)) {
            return implode(',', $value);
        }

        return $value;
    }

    /**
     * Calls a callback with a fresh Injector stack and a dummy cache for CacheBlock.
     */
    private function withoutPartialCache(callable $callback): mixed
    {
        Injector::nest();

        try {
            Injector::inst()->registerService(
                new Psr16Cache(new ArrayAdapter()),
                CacheInterface::class . '.cacheblock',
            );

            return $callback();
        } finally {
            Injector::unnest();
        }
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
        $relativeLink = Director::makeRelative($link);

        if (!$relativeLink) {
            $relativeLink = '/';
        }

        $mockRequest = new HTTPRequest('GET', $relativeLink);
        $mockRequest->setSession($this->getRequest()->getSession());
        $controller->setRequest($mockRequest);
        $controller->pushCurrent();

        try {
            $controller->doInit();

            return $controller->render();
        } catch (Throwable $e) {
            // The fallback renders the record on its own, without the page layout
            Injector::inst()->get(LoggerInterface::class)
            ->error(
                sprintf(
                    'Flux: page render failed for %s#%s, falling back to forTemplate(): %s',
                    $dataObject::class,
                    $dataObject->ID,
                    $e->getMessage(),
                ),
                ['exception' => $e],
            );

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
        $body = $payload;

        if ($payload instanceof FluxContext) {
            $body = $payload->jsonSerialize();
        }

        return HTTPResponse::create(json_encode($body), $status)
            ->addHeader('Content-Type', 'application/json');
    }

    private function jsonError(string $message, int $status): HTTPResponse
    {
        return $this->json(['error' => $message], $status);
    }

}
