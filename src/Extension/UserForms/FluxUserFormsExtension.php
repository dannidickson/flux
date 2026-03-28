<?php

namespace Flux\Extension\UserForms;

use Flux\Service\FluxConfigService;
use SilverStripe\Core\Extension;
use SilverStripe\ORM\DataObject;
use SilverStripe\UserForms\Extension\UserFormFieldEditorExtension;
use SilverStripe\UserForms\Model\EditableFormField\EditableFieldGroup;
use SilverStripe\UserForms\Model\EditableFormField\EditableFieldGroupEnd;
use SilverStripe\UserForms\Model\EditableFormField\EditableFormStep;

/**
 * Extension for PageController that hooks into FluxExtension's updateFluxConfig
 * to add UserForms field data to FluxConfig.
 *
 * Filters out non-visible field types (steps, groups) and builds an ID-to-selector
 * map so the frontend can match each DOM element to its record ID directly,
 * rather than relying on positional index matching.
 */
class FluxUserFormsExtension extends Extension
{
    public function updateFluxConfig(DataObject $page): void
    {
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

        // Build ID → CSS selector map using each field's Name property.
        // The UserForms holder template (EditableFormField_holder.ss) renders
        // <div id="$Name"> where $Name is the EditableFormField's Name field.
        $idMap = [];
        foreach ($fields as $field) {
            if ($field->Name) {
                $idMap[(string) $field->ID] = '#' . $field->Name;
            }
        }

        if (empty($idMap)) {
            return;
        }

        FluxConfigService::setRelationField(get_class($page), 'Fields', [
            'selector' => '.userform-fields .field',
            'actions' => ['edit', 'delete'],
            'idMap' => $idMap,
            'Fields' => [
                'Title' => ['bind' => '.left', 'type' => 'Text'],
            ],
        ]);
    }
}
