<?php

namespace Flux\Extension\UserForms;

use Flux\Extension\Forms\FluxGridFieldEditableColumns;
use SilverStripe\Core\Extension;
use SilverStripe\Forms\FieldList;
use SilverStripe\Forms\GridField\GridField;
use Symbiote\GridFieldExtensions\GridFieldEditableColumns;

/**
 * Extension for UserDefinedForm (or any class using UserFormFieldEditorExtension)
 * Replaces the standard GridFieldEditableColumns with FluxGridFieldEditableColumns
 * so that inline-editable column fields get fx-* attributes for preview sync.
 */
class FluxUserFormsCmsExtension extends Extension
{
    public function updateCMSFields(FieldList $fields): void
    {
        $gridField = $fields->dataFieldByName('Fields');

        if (!$gridField instanceof GridField) {
            return;
        }

        $config = $gridField->getConfig();
        $existing = $config->getComponentByType(GridFieldEditableColumns::class);

        if (!$existing || $existing instanceof FluxGridFieldEditableColumns) {
            return;
        }

        $displayFields = $existing->getDisplayFields($gridField);

        $fluxColumns = new FluxGridFieldEditableColumns();
        $fluxColumns->setDisplayFields($displayFields);

        $config->removeComponentsByType(GridFieldEditableColumns::class);
        $config->addComponent($fluxColumns);
    }
}
