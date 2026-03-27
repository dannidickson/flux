<?php

namespace Flux\API;

use SilverStripe\CMS\Controllers\ContentController;
use SilverStripe\CMS\Model\SiteTree;
use SilverStripe\Control\Controller;
use SilverStripe\Control\HTTPRequest;
use SilverStripe\Control\HTTPResponse;
use SilverStripe\Core\Injector\Injector;
use SilverStripe\Dev\Debug;
use SilverStripe\ORM\DataObject;
use SilverStripe\Versioned\Versioned;

class APIController extends Controller
{
    private static array $allowed_actions = [
        "pageTemplateUpdate",
        'blockUpdate',
        'shortCodesFragmentPatch'
    ];

    /**
     * Renders the full page template with all ChangeSet entries applied.
     * Handles both Page and Element changes — Element entries are applied
     * via applyBlockUpdate() before the full page render.
     *
     * @see FluxLiveState
     */
    public function pageTemplateUpdate(HTTPRequest $request): HTTPResponse
    {
        return Versioned::withVersionedMode(function () use ($request) {
            Versioned::set_stage(Versioned::DRAFT);

            $pageID = $request->getVar('pageID') ?? $request->postVar('pageID');
            $className = $request->getVar('className') ?? $request->postVar('className') ?? SiteTree::class;

            if (!$pageID) {
                return HTTPResponse::create(json_encode(['error' => 'pageID is required']), 400)
                    ->addHeader('Content-Type', 'application/json');
            }

            $liveState = json_decode($request->getBody(), true);
            $changeSet = $liveState['changeSet'] ?? [];

            $page = DataObject::get_by_id($className, $pageID);

            if (!$page) {
                return HTTPResponse::create(json_encode(['error' => 'Page not found']), 404)
                    ->addHeader('Content-Type', 'application/json');
            }

            // Apply Page changes
            if (isset($changeSet['Page'])) {
                $fields = $changeSet['Page']['fields'] ?? [];
                foreach ($fields as $fieldName => $value) {
                    if ($page->hasField($fieldName)) {
                        $page->$fieldName = $this->normaliseFieldValue($value);
                    }
                }
            }

            $segmentTemplateChanges = [
                'Elements' => [],
            ];

            // Apply Element changes via shared block update logic
            if (isset($changeSet['Element'])) {
                foreach ($changeSet['Element'] as $entry) {
                    $element = $this->applyBlockUpdate($entry);
                    $html = $element->forTemplate();
                    $segmentTemplateChanges['Elements'][$entry['ID']] = $html;
                }
            }

            // Render entire page
            $html = $this->renderPageTemplate($page);

            // @todo add proper validation for 'Trusted'
            $isTrusted = true;

            $response = [
                'pageID' => $pageID,
                'className' => $className,
                'html' => $html,
                'segmentTemplateChanges' => $segmentTemplateChanges,
                'changeSet' => $changeSet,
                'trusted' => $isTrusted,
            ];

            return HTTPResponse::create(json_encode($response))
                ->addHeader("X-Flux-HTML", true)
                ->addHeader("X-Flux-Trusted", $isTrusted ? "true" : "false")
                ->addHeader('Content-Type', 'application/json');
        });
    }

    /**
     * Renders a single block/element with ChangeSet applied.
     */
    public function blockUpdate(HTTPRequest $request): HTTPResponse
    {
        return Versioned::withVersionedMode(function () use ($request) {
            Versioned::set_stage(Versioned::DRAFT);

            $pageID = $request->getVar('pageID');
            $owner = $request->getVar('owner');

            if (!$pageID || !$owner) {
                return HTTPResponse::create(json_encode(['error' => 'pageID and owner are required']), 400)
                    ->addHeader('Content-Type', 'application/json');
            }

            $body = json_decode($request->getBody(), true);
            $changeSet = $body['changeSet'] ?? [];

            $entries = $changeSet['Element'] ?? [];

            if (empty($entries)) {
                return HTTPResponse::create(json_encode(['error' => 'changeSet.Element is required']), 400)
                    ->addHeader('Content-Type', 'application/json');
            }

            $entry = $entries[0];
            $element = $this->applyBlockUpdate($entry);

            if (!$element) {
                return HTTPResponse::create(json_encode(['error' => 'Element not found']), 404)
                    ->addHeader('Content-Type', 'application/json');
            }

            $html = $element->forTemplate();

            // @todo add proper validation for 'Trusted'
            $isTrusted = true;

            $response = [
                'pageID' => $pageID,
                'owner' => $owner,
                'html' => $html,
                'trusted' => $isTrusted,
            ];

            return HTTPResponse::create(json_encode($response))
                ->addHeader("X-Flux-HTML", true)
                ->addHeader("X-Flux-Trusted", $isTrusted ? "true" : "false")
                ->addHeader('Content-Type', 'application/json');
        });
    }

    /**
     * Apply field changes from a ChangeSet entry to a DataObject.
     * Shared between pageTemplateUpdate (for Element entries) and blockUpdate.
     *
     * @param array $entry { ClassName, ID, fields: { fieldName: value } }
     * @return DataObject|null The DataObject with changes applied, or null if not found
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

    public function shortCodesFragmentPatch(HTTPRequest $request): HTTPResponse
    {
        return Versioned::withVersionedMode(function () use ($request) {
            Versioned::set_stage(Versioned::DRAFT);

            $body = json_decode($request->getBody(), true);
            $value = $body['value'] ?? '';

            if (!$value) {
                return HTTPResponse::create(json_encode(['error' => 'value is required']), 400)
                    ->addHeader('Content-Type', 'application/json');
            }

            $html = \SilverStripe\View\Parsers\ShortcodeParser::get_active()->parse($value);

            $response = [
                'html' => $html,
                'key' => $body['key'] ?? null,
                'owner' => $body['owner'] ?? null,
                'trusted' => true,
            ];

            return HTTPResponse::create(json_encode($response))
                ->addHeader('Content-Type', 'application/json');
        });
    }

    /**
     * Normalise a field value for assignment to a DataObject.
     * Multi-select fields (e.g. CheckboxSetField) arrive as arrays — convert to comma-separated string.
     */
    private function normaliseFieldValue(mixed $value): mixed
    {
        if (is_array($value)) {
            return implode(',', $value);
        }

        return $value;
    }

    /**
     * Takes the dataObject with the Changed fields from FluxLiveState and renders the changes
     * Creates a controller context and renders the page as it would appear on the frontend
     */
    private function renderPageTemplate(DataObject $dataObject): string
    {
        if ($dataObject instanceof SiteTree) {
            $controllerClass = $dataObject->getControllerName();

            if (!class_exists($controllerClass)) {
                $controllerClass = ContentController::class;
            }

            $controller = Injector::inst()->create($controllerClass, $dataObject);
            $controller->doInit();

            try {
                $html = $controller->render();
                return $html;
            } catch (\Exception $e) {
                return $dataObject->forTemplate();
            }
        }

        // For other DataObjects, use forTemplate
        return $dataObject->forTemplate();
    }
}
