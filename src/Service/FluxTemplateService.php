<?php

namespace Flux\Service;

use Flux\TemplateEngine\FluxTemplateParser;
use SilverStripe\Control\Controller;
use SilverStripe\Core\Injector\Injectable;
use SilverStripe\TemplateEngine\SSTemplateEngine;
use SilverStripe\View\SSViewer;

/**
 * Service for managing FluxTemplateParser lifecycle
 *
 * Used to enable the FluxTemplateParser at specific times.
 * EG: CMSPreview or APIController::templateUpdate call
 */
class FluxTemplateService
{
    use Injectable;

    /**
     * Render a controller's template with FluxTemplateParser
     *     *
     * @param Controller $controller The controller to render
     * @param string|null $action Optional action name (defaults to controller's action)
     * @return string Rendered HTML with FLUX markers
     */
    public function renderWithFluxParser(Controller $controller, ?string $action = null): string
    {
        SSTemplateEngine::flushTemplateCache();

        $action = $action ?? $controller->getAction();
        $viewer = $controller->getViewer($action);

        $engine = $viewer->getTemplateEngine();
        $fluxParser = new FluxTemplateParser();
        $engine->setParser($fluxParser);

        return (string) $viewer->process($controller);
    }

    /**
     * Apply FluxTemplateParser to a viewer
     */
    public function applyFluxParser(SSViewer $viewer): FluxTemplateParser
    {
        $engine = $viewer->getTemplateEngine();
        $fluxParser = new FluxTemplateParser();
        $engine->setParser($fluxParser);

        return $fluxParser;
    }
}
