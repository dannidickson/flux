<?php

namespace Flux\Extension\UserForms;

use Flux\Context\FluxContext;
use Flux\Extension\Forms\FluxGridFieldEditableColumns;
use SilverStripe\Core\Extension;
use SilverStripe\Forms\FieldList;
use SilverStripe\Forms\GridField\GridField;
use SilverStripe\UserForms\Extension\UserFormFieldEditorExtension;
use SilverStripe\UserForms\Model\EditableFormField\EditableFieldGroup;
use SilverStripe\UserForms\Model\EditableFormField\EditableFieldGroupEnd;
use SilverStripe\UserForms\Model\EditableFormField\EditableFormStep;
use Symbiote\GridFieldExtensions\GridFieldEditableColumns;

/**
 * Enables Flux to work with UserForms
 */
class FluxUserFormsExtension extends Extension
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

    public function updateFluxContext(FluxContext $context): void
    {
        $page = $this->getOwner();

        if (!$page->hasExtension(UserFormFieldEditorExtension::class)) {
            return;
        }

        $fields = $page->Fields()->exclude('ClassName', [
            EditableFormStep::class,
            EditableFieldGroup::class,
            EditableFieldGroupEnd::class,
        ]);

        if (!$fields->count()) {
            return;
        }

        // UserForms renders <div id="$Name"> via EditableFormField_holder.ss,
        // so the per-field selector is just `#{Name}`.
        $idMap = [];

        foreach ($fields as $field) {
            if (!$field->Name) {
                continue;
            }

            $idMap[(string) $field->ID] = '#' . $field->Name;
        }

        if ($idMap === []) {
            return;
        }

        $context->addRelationField($page::class, 'Fields', [
            'selector' => '.userform-fields .field',
            'actions' => ['edit', 'delete'],
            'idMap' => $idMap,
            'Fields' => [
                'Title' => ['bind' => '.left', 'type' => 'Text'],
            ],
        ]);
    }

}
