<?php

namespace Flux\Extension;

use Flux\Repository\FluxRepository;
use SilverStripe\Control\Controller;
use SilverStripe\Core\Extension;
use SilverStripe\Dev\Debug;
use SilverStripe\Security\SecurityToken;
use SilverStripe\View\Requirements;

/**
 * @extends Extension<object>
 */
class FluxExtension extends Extension
{
    /**
     * Add the JS requirements
     *
     * Adds the LiveUpdate code when the user is using the CMSPreview (iframe)
     */
    public function onBeforeInit(): void
    {
        $request = Controller::curr()->getRequest();
        $securityID = SecurityToken::getSecurityID();

        Requirements::javascript("dannidickson/flux: client/dist/js/frontend.js");

        if ($securityID && $request->getVar('CMSPreview')) {
            Requirements::javascript("dannidickson/flux: client/dist/js/bind/frame.js");
            Requirements::javascript("dannidickson/flux: client/dist/js/silverstripe-cms/frame.js");
        }
    }

    public function onAfterInit(): void
    {
        $request = Controller::curr()->getRequest();
        $securityID = SecurityToken::getSecurityID();
        $curr = Controller::curr();
        $pageId = $curr->ID;

        $isCMSPreview = $request->getVar('CMSPreview') && $securityID;

        if (method_exists($curr, 'data') && $curr->data()) {
            $this->addFluxConfigToCMSPreview($curr->data(), $pageId, $isCMSPreview);
        }
    }

    /**
     * Creates the global window object for FluxConfig
     * Passing the binding attributes for each Field that is set in the `flux_fields`
     *
     * The Fields are only added when the CMSPreview paramater is set as well as user logged in
     */
    private function addFluxConfigToCMSPreview(mixed $pageData, int $pageId, bool $isCMSPreview): void
    {
        $config = $pageData->config();
        $fluxFields = $config->get("flux_fields");

        // @ingore
        $fluxEvents = $config->get("flux_events");

        if (!$fluxFields) {
            return;
        }

        $fluxConfig = [
            "ID" => $pageId,
            "ClassName" => get_class($pageData),
            "Fields" => [],
            "Events" => [],
            "Keys" => [],
        ];

        if ($isCMSPreview) {
            $fluxConfigFleids = [];
            $fluxFieldsKeys = [];
            foreach ($fluxFields as $key => $value) {
                $fluxType = FluxRepository::getFluxDataType($key, $pageData->config());

                if (!$fluxType) {
                    continue;
                }

                $fluxFieldsKeys[] = $key;
                $fluxConfigFleids[$key] = [
                    'key' => $key,
                    'bind' => $value,
                    'type' => $fluxType,
                ];

                $fluxConfig['Fields'] = $fluxConfigFleids;
                $fluxConfig['Keys'] = $fluxFieldsKeys;
            }
        }

        // @ingore
        if ($fluxEvents) {
        }

        Requirements::customScript(
            "window.FluxConfig = " . json_encode($fluxConfig) . ";",
            'flux-config'
        );
    }
}
