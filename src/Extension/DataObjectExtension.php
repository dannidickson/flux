<?php

namespace Flux\Extension;

use Flux\Schema\FluxSchema;
use Flux\Schema\UpdateMode;
use SilverStripe\Core\Extension;
use SilverStripe\Forms\FieldList;
use SilverStripe\Forms\FormField;

/**
 * Extension for DataObject
 * Handles setting flux field attributes on CMS form fields
 */
class FluxDataObjectExtension extends Extension
{

    /**
     * Hook into updateCMSFields to set flux field attributes
     */
    public function updateCMSFields(FieldList $fields): void
    {
        $this->setFluxFields($fields);
    }

    /**
     * Set flux field attributes on form fields.
     */
    public function setFluxFields(FieldList $fields): FieldList
    {
        $config = $this->getOwner()->config();
        $hasOne = $config->get('has_one');

        $fluxFields = $config->get('flux_fields') ?? [];

        foreach ($fluxFields as $key => $value) {
            $field = $fields->dataFieldByName($key);

            if (!$field && array_key_exists($key, $hasOne ?? [])) {
                $field = $fields->dataFieldByName($key . 'ID');
            }

            if (!$field) {
                continue;
            }

            // Entries may be a selector string or a {DOMSelector, UpdateMode} map.
            [$bind, $updateMode] = FluxSchema::normaliseBind($value);

            $this->setFieldAttributes($field, $key, $bind ?? '', $updateMode);
        }

        return $fields;
    }

    /**
     * Set the attributes to the field dom elements
     */
    private function setFieldAttributes(
        FormField $field,
        string $key,
        string $value,
        string $updateMode = UpdateMode::TEXT,
    ): FormField {
        $schemaDataType = $field->getSchemaDataType();
        $fluxType = $schemaDataType;

        if ($schemaDataType === 'Custom') {
            $fluxType = $field->getSchemaComponent();
        }

        if (!$fluxType) {
            return $field;
        }

        // Each field type owns its own attribute configuration.
        if ($field->hasMethod('applyFluxAttributes')) {
            $field->applyFluxAttributes($key, $value, $fluxType);
            $field->setAttribute('fx-event-type', $updateMode);
        }

        if ($this->getOwner()->hasMethod('getOwnerTarget')) {
            $ownerTarget = $this->getOwner()->getOwnerTarget();

            if ($ownerTarget) {
                $field->setAttribute('fx-owner', $ownerTarget);
            }
        }

        return $field;
    }

    /**
     * Call this at the end of getCMSFields() if you're modifying fields after parent::getCMSFields()
     */
    public function applyFluxAttributes(FieldList $fields): void
    {
        $this->setFluxFields($fields);
    }

    public function getFluxEnabled(): bool
    {
        return true;
    }

}
