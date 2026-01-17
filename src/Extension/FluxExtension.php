<?php

namespace Flux\Extension;

use Flux\Service\FluxConfigService;
use SilverStripe\Control\Controller;
use SilverStripe\Core\Extension;
use SilverStripe\Security\SecurityToken;
use SilverStripe\View\Requirements;

/**
 * Extension for ContentController (Page rendering context)
 * Handles the iframe preview side
 *
 * @extends Extension<object>
 */
class FluxExtension extends Extension
{
    /**
     * Add the JS requirements and FluxConfig for preview iframe
     */
    public function onBeforeInit(): void
    {
        $request = Controller::curr()->getRequest();
        $securityID = SecurityToken::getSecurityID();

        Requirements::javascript("dannidickson/flux: client/dist/js/frontend.js");

        if ($securityID && $request->getVar('CMSPreview')) {
            // Clear any existing config data from other contexts
            FluxConfigService::reset();

            // Preview iframe context - register the current page
            $controller = Controller::curr();
            if (method_exists($controller, 'data') && $controller->data()) {
                $page = $controller->data();

                // Register page with service
                FluxConfigService::setPage($page);

                // Register elements if available
                if ($page->hasMethod('ElementalArea') && $page->ElementalArea()->exists()) {
                    FluxConfigService::addElements($page->ElementalArea()->Elements());
                }
            }

            Requirements::javascript("dannidickson/flux: client/dist/js/bind/frame.js");
            Requirements::javascript("dannidickson/flux: client/dist/js/silverstripe-cms/frame.js");
        }
    }

    /**
     * Output window.FluxConfig for iframe preview
     * Called after all data is registered
     */
    public function onAfterInit(): void
    {
        $request = Controller::curr()->getRequest();
        $securityID = SecurityToken::getSecurityID();

        if ($securityID && $request->getVar('CMSPreview') && FluxConfigService::hasConfig()) {
            Requirements::customScript(
                "window.FluxConfig = " . json_encode(FluxConfigService::getConfig()) . ";",
                'flux-config'
            );
        }
    }
}
