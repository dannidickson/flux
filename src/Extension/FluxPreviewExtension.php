<?php

namespace Flux\Extension;

use Flux\Service\FluxTemplateService;
use SilverStripe\Control\HTTPRequest;
use SilverStripe\Core\Extension;

/**
 * Extension for ContentController to inject FluxTemplateParser in CMS preview mode
 *
 * This ensures the initial preview HTML contains FLUX comment markers,
 * allowing the frontend to use TreeWalker to find comment nodes.
 *
 * Only applies when:
 * - In CMS preview mode (CMSPreview parameter present)
 * - NOT on the live site
 */
class FluxPreviewExtension extends Extension
{
    /**
     * Hook before action handler to inject FluxTemplateParser rendering
     *
     * This is called before template rendering happens. If we're in preview mode,
     * we render with FluxTemplateParser and return the result, bypassing normal rendering.
     *
     * @param HTTPRequest $request
     * @param string $action
     * @return string|null Return rendered HTML to bypass normal rendering, or null to continue
     */
    public function beforeCallActionHandler(HTTPRequest $request, string $action)
    {
        // Only apply in CMS preview mode
        if (!$this->isPreviewMode()) {
            return null;
        }

        // Use the service to render with FluxTemplateParser
        /** @var FluxTemplateService $fluxService */
        $fluxService = FluxTemplateService::singleton();

        // Return the rendered HTML, bypassing normal rendering
        return $fluxService->renderWithFluxParser($this->owner, $action);
    }

    /**
     * Check if we're in CMS preview mode
     *
     * @return bool
     */
    protected function isPreviewMode(): bool
    {
        $request = $this->owner->getRequest();

        if (!$request instanceof HTTPRequest) {
            return false;
        }

        // Check for CMSPreview parameter (this is what FluxExtension uses)
        $isCMSPreview = $request->getVar('CMSPreview');

        return (bool) $isCMSPreview;
    }
}
