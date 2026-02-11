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
     * Gets the DataObject and renders the template.
     *
     * Supports rendering entire page OR specific segments (e.g., just a CTA element)
     * Expects pageID, and optionally a target segment owner
     *
     * @see FluxLiveState
     */
    public function pageTemplateUpdate(HTTPRequest $request): HTTPResponse
    {
        return Versioned::withVersionedMode(function () use ($request) {
            Versioned::set_stage(Versioned::DRAFT);

            $pageID = $request->getVar('pageID') ?? $request->postVar('pageID');
            $className = $request->getVar('className') ?? $request->postVar('className') ?? SiteTree::class;
            $targetOwner = $request->getVar('owner') ?? $request->postVar('owner'); // Optional: specific segment to render

            if (!$pageID) {
                return HTTPResponse::create(json_encode(['error' => 'pageID is required']), 400)
                    ->addHeader('Content-Type', 'application/json');
            }

            $liveState = json_decode($request->getBody(), true);
            $segmentChanges = $liveState['segmentChanges'] ?? [];

            $page = DataObject::get_by_id($className, $pageID);

            if (!$page) {
                return HTTPResponse::create(json_encode(['error' => 'Page not found']), 404)
                    ->addHeader('Content-Type', 'application/json');
            }

            // Apply segment-specific changes
            foreach ($segmentChanges as $segmentKey => $segmentData) {
                $segmentType = $segmentData['segmentType'] ?? 'Page';
                $segmentID = $segmentData['segmentID'] ?? null;
                $segmentClassName = $segmentData['className'] ?? null;
                $fields = $segmentData['fields'] ?? [];

                if ($segmentType === 'Page') {
                    // Apply changes to page
                    foreach ($fields as $fieldName => $value) {
                        if ($page->hasField($fieldName)) {
                            $page->$fieldName = $value;
                        }
                    }
                } elseif ($segmentType === 'Element' && $segmentID && $segmentClassName) {
                    // Apply changes to specific element
                    $element = DataObject::get_by_id($segmentClassName, $segmentID);
                    if ($element) {
                        foreach ($fields as $fieldName => $value) {
                            if ($element->hasField($fieldName)) {
                                $element->$fieldName = $value;
                            }
                        }
                    }
                }
            }

            // Render based on target
            if ($targetOwner && isset($segmentChanges[$targetOwner])) {
                // Render specific segment
                $html = $this->renderSegment($targetOwner, $segmentChanges[$targetOwner]);
            } else {
                // Render entire page
                $html = $this->renderPageTemplate($page);
            }

            // @todo add proper validation for 'Trusted'
            $isTrusted = true;

            $response = [
                'pageID' => $pageID,
                'className' => $className,
                'html' => $html,
                'targetOwner' => $targetOwner,
                'segmentChanges' => $segmentChanges,
                'trusted' => $isTrusted,
            ];

            return HTTPResponse::create(json_encode($response))
                ->addHeader("X-Flux-HTML", true)
                ->addHeader("X-Flux-Trusted", $isTrusted ? "true" : "false")
                ->addHeader('Content-Type', 'application/json');
        });
    }

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

            $segmentID = $body['segmentID'] ?? null;
            $segmentClassName = $body['segmentClassName'] ?? null;
            $fields = $body['fields'] ?? [];

            if (!$segmentID || !$segmentClassName) {
                return HTTPResponse::create(json_encode(['error' => 'segmentID and segmentClassName are required']), 400)
                    ->addHeader('Content-Type', 'application/json');
            }

            $element = DataObject::get_by_id($segmentClassName, $segmentID);

            if (!$element) {
                return HTTPResponse::create(json_encode(['error' => 'Element not found']), 404)
                    ->addHeader('Content-Type', 'application/json');
            }

            // Apply field changes BEFORE rendering
            foreach ($fields as $fieldName => $value) {
                if ($element->hasField($fieldName)) {
                    $element->$fieldName = $value;
                }
            }

            $html = $element->forTemplate();

            // @todo add proper validation for 'Trusted'
            $isTrusted = true;

            $response = [
                'pageID' => $pageID,
                'owner' => $owner,
                'segmentID' => $segmentID,
                'html' => $html,
                'trusted' => $isTrusted,
            ];

            return HTTPResponse::create(json_encode($response))
                ->addHeader("X-Flux-HTML", true)
                ->addHeader("X-Flux-Trusted", $isTrusted ? "true" : "false")
                ->addHeader('Content-Type', 'application/json');
        });
    }

    public function shortCodesFragmentPatch(HTTPRequest $request): HTTPResponse
    {
        // Placeholder for future block update logic
        return HTTPResponse::create(json_encode(['status' => 'Not implemented']), 501)
            ->addHeader('Content-Type', 'application/json');
    }

    /**
     * Render a specific segment (e.g., just a CTA element)
     *
     * @param string $owner The owner identifier (e.g., #element-5)
     * @param array $segmentData Segment metadata
     */
    private function renderSegment(string $owner, array $segmentData): string
    {
        $segmentID = $segmentData['segmentID'] ?? null;
        $segmentClassName = $segmentData['className'] ?? null;
        $fields = $segmentData['fields'] ?? [];

        if (!$segmentID || !$segmentClassName) {
            return '';
        }

        $dataObject = DataObject::get_by_id($segmentClassName, $segmentID);

        if (!$dataObject) {
            return '';
        }

        // Apply field changes before rendering (fixes re-fetch losing in-memory changes)
        foreach ($fields as $fieldName => $value) {
            if ($dataObject->hasField($fieldName)) {
                $dataObject->$fieldName = $value;
            }
        }

        // Render just this segment
        return $dataObject->forTemplate();
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
