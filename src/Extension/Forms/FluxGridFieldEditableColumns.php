<?php

namespace Flux\Extension\Forms;

use SilverStripe\Forms\FieldList;
use SilverStripe\Forms\GridField\GridField;
use SilverStripe\ORM\DataObjectInterface;
use Symbiote\GridFieldExtensions\GridFieldEditableColumns as BaseGridFieldEditableColumns;

class FluxGridFieldEditableColumns extends BaseGridFieldEditableColumns
{

    /**
     * Override getFields to apply flux attributes to editable column fields
     *
     * @param GridField $grid
     * @param DataObjectInterface $record
     * @return FieldList
     */
    public function getFields(GridField $grid, DataObjectInterface $record)
    {
        $fields = parent::getFields($grid, $record);

        $fluxFields = $record->config()->get('flux_fields');


        // Apply flux attributes to configured fields
        if (!empty($fluxFields)) {
            foreach ($fluxFields as $fieldName => $fluxBind) {
                $field = $fields->dataFieldByName($fieldName);

                if ($field && $field->hasMethod('applyFluxAttributes')) {
                    // Get the field's schema data type for flux-type
                    $schemaDataType = $field->getSchemaDataType();
                    $componentType = $field->getSchemaComponent();

                    $fluxType = $schemaDataType;
                    if ($schemaDataType === 'Custom') {
                        $fluxType = $componentType;
                    }

                    // Apply flux attributes via the field's extension
                    $field->applyFluxAttributes($fieldName, $fluxBind, $fluxType);

                    $field->setAttribute('fx-event-type', 'templateUpdate');
                }
            }
        }

        return $fields;
    }
}
