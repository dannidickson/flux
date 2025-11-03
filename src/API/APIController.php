<?php

namespace Flux\API;

use Flux\Service\PartialTemplateRenderer;
use Flux\TemplateEngine\FluxTemplateParser;
use SilverStripe\CMS\Controllers\ContentController;
use SilverStripe\CMS\Model\SiteTree;
use SilverStripe\Control\Controller;
use SilverStripe\Control\HTTPRequest;
use SilverStripe\Control\HTTPResponse;
use SilverStripe\Core\Injector\Injector;
use SilverStripe\Dev\Debug;
use SilverStripe\ORM\DataObject;
use SilverStripe\TemplateEngine\SSTemplateEngine;

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
      * @todo I expect Elemental blocks or 'include' to use the same API endpoint, so pageID will be renamed to ObjectID
      *
      * @see FluxLiveState
      * @see \Flux\TemplateEngine\FluxTemplateParser
      * @see \Flux\Service\PartialTemplateRenderer
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

        $fluxFields = $page->config()->get('flux_fields') ?? [];
        $fluxContainer = $page->config()->get('flux_container') ?? 'body';

        /** @var PartialTemplateRenderer $renderer */
        $renderer = PartialTemplateRenderer::singleton();

        $changedBlocks = $renderer->extractChangedBlocks($html, $changedFields, $fluxFields);

        // Using the flux_fields values, get the blocks for our patches array
        if (!empty($fluxFields)) {
            $selectorBlocks = $renderer->extractBySelectors($html, $changedFields, $fluxFields, $changedBlocks);
            $changedBlocks = array_merge($changedBlocks, $selectorBlocks);
        }

        // @TODO: CMSPreview should render the HTML
        // Atm we send it back and do the full morph
        $containerHtml = $renderer->extractContainer($html, $fluxContainer);

        $blockCount = $renderer->countBlocks($html);
        $hasPartialSupport = $blockCount > 0 || !empty($changedBlocks);

        // Debug::dump("Flux: Rendered HTML contains {$blockCount} blocks");
        // Debug::dump("Flux: Changed fields: " . json_encode(array_keys($changedFields)));
        // Debug::dump("Flux: Extracted " . count($changedBlocks) . " changed blocks");

        // @todo add proper validation for 'Trusted'
        $isTrusted = true;

        $response = [
            'pageID' => $pageID,
            'className' => $className,
            'html' => $containerHtml ?? $html, // Container HTML if available, otherwise full HTML
            'patches' => $changedBlocks,
            'changedFields' => $changedFields,
            'trusted' => $isTrusted,
            'hasPartialSupport' => $hasPartialSupport,
            'blockCount' => count($changedBlocks),
            'container' => $fluxContainer, // Tell frontend which container to morph
        ];

        return HTTPResponse::create(json_encode($response))
            ->addHeader("X-Flux-HTML", true)
            ->addHeader("X-Flux-Trusted", $isTrusted ? "true" : "false")
            ->addHeader("X-Flux-Partial", $hasPartialSupport ? "true" : "false")
            ->addHeader('Content-Type', 'application/json');
    }

     /**
        * Takes the dataObject with the Changed fields from FluxLiveState and renders the changes
        * Creates a controller context and renders the page as it would appear on the frontend
        *
        * Uses FluxTemplateParser ONLY for this render (not globally registered).
        * Injects invisible HTML comment markers for dependency tracking.
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
                $html = $this->renderWithFluxParser($controller);
                return $html;
            } catch (\Exception $e) {
                return $dataObject->forTemplate();
            }
        }

        return $dataObject->forTemplate();
    }

    /**
     * Render controller template using FluxTemplateParser
     * Using the our own flavor of a TemplateParser we inject HTML comments
     *
     * @param ContentController $controller
     * @return string Rendered HTML with comment markers
     */
    private function renderWithFluxParser(ContentController $controller): string
    {
        // We need to flush the template cache
        SSTemplateEngine::flushTemplateCache();

        $action = $controller->getAction();
        $viewer = $controller->getViewer($action);

        $engine = $viewer->getTemplateEngine();
        $fluxParser = new FluxTemplateParser();
        $engine->setParser($fluxParser);

        $html = $viewer->process($controller);

        $hasMarkers = strpos($html, '<!-- FLUX_START:') !== false;
        if (!$hasMarkers) {
            Debug::dump('WARNING: No FLUX markers found in rendered HTML!');
        }

        return (string)$html;
    }

}
