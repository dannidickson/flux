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
        "getContent",
        "templateUpdate"
    ];

    /**
     * @TODO this was just an experiment for what a livewire component like system might look like.
     */
    public function getContent(HTTPRequest $request): HTTPResponse
    {
        $html = '<div class="page__content">More content here</div>';

        $dataToSend = [
            "html" => $html,
        ];

        return HTTPResponse::create(json_encode($dataToSend))
            ->addHeader("X-Flux-HTML", true)
            ->addHeader("X-Flux-Trusted", true);
    }

    /**
     * Gets the DataObject and renders the template.
     *
     * Supports rendering entire page OR specific segments (e.g., just a CTA element)
     * Expects pageID, and optionally a target segment owner
     *
     * @see FluxLiveState
     */
    public function templateUpdate(HTTPRequest $request): HTTPResponse
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

        if (!$segmentID || !$segmentClassName) {
            return '';
        }

        $dataObject = DataObject::get_by_id($segmentClassName, $segmentID);

        if (!$dataObject) {
            return '';
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
