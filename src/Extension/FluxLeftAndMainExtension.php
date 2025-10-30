<?php

namespace Flux\Extension;

use SilverStripe\Control\Controller;
use SilverStripe\Core\Extension;
use SilverStripe\Dev\Debug;
use SilverStripe\Security\Security;
use SilverStripe\View\Requirements;

class FluxLeftAndMainExtension extends Extension
{
    /**
     * Add the Live Update Host Channel to the requirements on the CMS Parent (webpage)
     */
    public function onBeforeInit(): void
    {
        $member = Security::getCurrentUser();

        if (!$member) {
            return;
        }


       $fluxLiveConfig = [
        'DataObjectID' => $this->getOwner()->currentRecordID() ?? null,
        'ClassName' => $this->getOwner()->getModelClass() ?? null,
       ];

        Requirements::javascript('dannidickson/flux: client/dist/js/bind/host.js');
        Requirements::javascript('dannidickson/flux: client/dist/js/silverstripe-cms/host.js');

        Requirements::customScript(
            "window.FluxLiveConfig = " . json_encode($fluxLiveConfig) . ";",
            'flux-live-config'
        );
    }
}
