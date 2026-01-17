<?php

namespace Flux\Extension;

use Flux\Service\FluxConfigService;
use SilverStripe\Core\Extension;
use SilverStripe\Forms\DatalessField;
use SilverStripe\Forms\FormAction;
use SilverStripe\Forms\LiteralField;
use SilverStripe\Security\Security;
use SilverStripe\View\Requirements;
use SilverStripe\Forms\Tip;

/**
 * Extension for LeftAndMain (CMS admin controller)
 * Handles the host-side (CMS admin) requirements and FluxConfig
 */
class FluxLeftAndMainExtension extends Extension
{
    /**
     * Add requirements and register current record with FluxConfigService
     */
    public function onBeforeInit(): void
    {
        $member = Security::getCurrentUser();

        if (!$member) {
            return;
        }

        // Clear any existing config data from other contexts
        FluxConfigService::reset();

        // Add host-side JavaScript requirements
        Requirements::javascript('dannidickson/flux: client/dist/js/bind/host.js');
        Requirements::javascript('dannidickson/flux: client/dist/js/silverstripe-cms/host.js');

        // Register the currently edited record
        $recordID = $this->getOwner()->currentRecordID();
        $modelClass = $this->getOwner()->currentRecord();



        if ($recordID && $modelClass && class_exists($modelClass)) {
            $record = $modelClass::get()->byID($recordID);
            if ($record) {
                // Register the record as the page
                FluxConfigService::setPage($record);

                // Register elements if this record has them
                if ($record->hasMethod('ElementalArea') && $record->ElementalArea()->exists()) {
                    FluxConfigService::addElements($record->ElementalArea()->Elements());
                }

            }
        }
    }

    /**
     * Output window.FluxConfig for CMS admin side
     */
    public function onAfterInit(): void
    {
        $member = Security::getCurrentUser();

        if (!$member) {
            return;
        }


        // Output FluxConfig if we have data
        if (FluxConfigService::hasConfig()) {
            Requirements::customScript(
                "window.FluxConfig = " . json_encode(FluxConfigService::getConfig()) . ";",
                'flux-config-host'
            );
        }
    }

    public function updateEditForm(&$form)
    {
        $currentRecord = $this->getOwner()->currentRecord();
        if ($currentRecord && $currentRecord->hasMethod('getFluxEnabled')) {
            $fluxCMSUI = $this->getOwner()->renderWith($this->getOwner()->getTemplatesWithSuffix('_FluxCmsActionsUI'));
            $form->Actions()->push(
                LiteralField::create('FluxCMSUIPlaceholder', $fluxCMSUI)
            );
        }
        // Custom logic to modify the CMS main edit form can be added here
    }

}
