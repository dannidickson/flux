<?php

namespace Flux\Extension\Forms;

use Flux\Schema\FluxSchema;
use SilverStripe\Forms\FieldList;
use SilverStripe\Forms\GridField\GridField;
use SilverStripe\ORM\DataObjectInterface;
use Symbiote\GridFieldExtensions\GridFieldEditableColumns as BaseGridFieldEditableColumns;

class FluxGridFieldEditableColumns extends BaseGridFieldEditableColumns
{

    /**
     * Applies flux attributes to the editable column fields.
     */
    public function getFields(GridField $grid, DataObjectInterface $record): FieldList
    {
        $fields = parent::getFields($grid, $record);
        $fluxFields = $record->config()->get('flux_fields') ?? [];

        foreach ($fluxFields as $fieldName => $fluxBind) {
            $field = $fields->dataFieldByName($fieldName);

            if (!$field || !$field->hasMethod('applyFluxAttributes')) {
                continue;
            }

            $schemaDataType = $field->getSchemaDataType();
            $fluxType = $schemaDataType;

            if ($schemaDataType === 'Custom') {
                $fluxType = $field->getSchemaComponent();
            }

            $ownerId = (string) $record->ID;

            if ($record->hasMethod('getOwnerTarget')) {
                $ownerId = (string) $record->getOwnerTarget();
            }

            // Entries may be a selector string or a {DOMSelector, UpdateMode} map.
            [$bind, $updateMode] = FluxSchema::normaliseBind($fluxBind);

            $field->applyFluxAttributes($fieldName, $bind ?? '', $fluxType);
            $field->setAttribute('fx-owner', $ownerId);
            $field->setAttribute('fx-event-type', $updateMode);
        }

        return $fields;
    }

}
