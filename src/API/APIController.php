<?php

namespace Flux\API;

use SilverStripe\CMS\Controllers\ContentController;
use SilverStripe\CMS\Model\SiteTree;
use SilverStripe\Control\Controller;
use SilverStripe\Control\HTTPRequest;
use SilverStripe\Control\HTTPResponse;
use SilverStripe\Core\Injector\Injector;
use SilverStripe\ORM\DataObject;

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
      * Expects both the PageID and ClassName
      * As well as the FluxLiveState Javascript object to be sent
      *
      * @todo this currently just renders the entire page for the POC
      * @todo I expect Elemental blocks or 'include' to use the same API endpoint, so pageID will be renamed to ObjectID
      *
      * @see FluxLiveState
      */
    public function templateUpdate(HTTPRequest $request): HTTPResponse
    {
        $pageID = $request->getVar('pageID') ?? $request->postVar('pageID');
        $className = $request->getVar('className') ?? $request->postVar('className') ?? SiteTree::class;

        if (!$pageID) {
            return HTTPResponse::create(json_encode(['error' => 'pageID is required']), 400)
                ->addHeader('Content-Type', 'application/json');
        }

        $liveState = json_decode($request->getBody(), true);
        $changedFields = $liveState['fields'] ?? [];

        $page = DataObject::get_by_id($className, $pageID);

        if (!$page) {
            return HTTPResponse::create(json_encode(['error' => 'Page not found']), 404)
                ->addHeader('Content-Type', 'application/json');
        }

        // Apply the LiveState changes
        if ($changedFields) {
            foreach ($changedFields as $fieldName => $value) {
                if ($page->hasField($fieldName)) {
                    $page->$fieldName = $value;
                }
            }
        }

        $html = $this->renderPageTemplate($page);

        // @todo add proper validation for 'Trusted'
        $isTrusted = true;

        $response = [
            'pageID' => $pageID,
            'className' => $className,
            'html' => $html,
            'changedFields' => $changedFields,
            'trusted' => $isTrusted,
        ];

        return HTTPResponse::create(json_encode($response))
            ->addHeader("X-Flux-HTML", true)
            ->addHeader("X-Flux-Trusted", $isTrusted ? "true" : "false")
            ->addHeader('Content-Type', 'application/json');
    }

     /**
        * Takes the dataObject with the Changed fields from FluxLiveState and renders the changes
        * Creates a controller context and renders the page as it would appear on the frontend
        *
        * @todo in reality there would be a "final" step that checks if the Field
        * that triggered included a 'target' or 'include' property
        *
        * For targets it would query the DOMDocument and return only that specific html.
        *   Alternatively it would send back the full HTML. This wouldnt render the entire elemental area,
        *   because it will have its seperate functional call
        *
        * For `include` it would use the value as the name of the File in the `includes` directory to render
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
