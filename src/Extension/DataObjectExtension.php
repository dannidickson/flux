<?php

namespace Flux\Extension;

use SilverStripe\Core\Extension;
use SilverStripe\Dev\Debug;
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
    public function updateCMSFields(FieldList $fields)
    {
        $this->setFluxFields($fields);
    }

    /**
     * Set flux field attributes on form fields
     */
    public function setFluxFields(FieldList $fields)
    {
        $config = $this->getOwner()->config();
        $fluxFields = $config->get("flux_fields");

        $hasOne = $config->get("has_one");

        if (!$fluxFields || !is_array($fluxFields)) {
            return $fields;
        }

        foreach ($fluxFields as $key => $value) {
            $field = $fields->dataFieldByName($key);

            if (!$field && array_key_exists($key, $hasOne)) {
                $hasOneIDKey = (string) $key . 'ID';
                $field = $fields->dataFieldByName($hasOneIDKey);
            }

            if (!$field) {
                continue;
            }

            $field = $this->setFieldAttributes($field, $key, $value);
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
    ): FormField {

        // $fluxType = FluxRepository::getFluxDataType($key, $this->getOwner()->config());

        $formFieldType = $field->getInputType();
        $schemaDataType = $field->getSchemaDataType();
        $componentType = $field->getSchemaComponent();

        $fluxType = null;

        $fluxType = $schemaDataType;
        if ($schemaDataType === 'Custom') {
            $fluxType = $componentType;
        }

        if (!$fluxType) {
            return $field;
        }

        // Delegate to the FormField extension to apply flux attributes
        // Each field type is now responsible for its own attribute configuration
        if ($field->hasMethod('applyFluxAttributes')) {
            $field->applyFluxAttributes($key, $value, $fluxType);
        }

        if ($this->getOwner()->hasMethod('getOwnerTarget')) {
            $ownerTarget = $this->getOwner()->getOwnerTarget();
            if ($ownerTarget) {
                $field->setAttribute("fx-owner", $ownerTarget);
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
