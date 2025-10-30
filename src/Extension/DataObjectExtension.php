<?php

namespace Flux\Extension;

use Flux\Repository\FluxRepository;
use SilverStripe\Core\Extension;
use SilverStripe\Dev\Debug;
use SilverStripe\Forms\FieldList;
use SilverStripe\Forms\FormField;

class FluxDataObjectExtension extends Extension
{
    public function setFluxFields(FieldList $fields)
    {
        $config = $this->getOwner()->config();
        $fluxFields = $config->get("flux_fields");

        $hasOne = $config->get("has_one");

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

        $field->setAttribute("fx-key", $key);


        if ($fluxType === "Text" || $fluxType === "HTML") {
            $field->setAttribute("fx-event", "keyup");
        }

        if ($fluxType === "Boolean") {
            $field->setAttribute("fx-event", "click");
        }

        if ($fluxType === "UploadField") {
            $field->setAttribute("fx-event", "change");
            $field->setAttribute("fx-proxy", "input[type='hidden']");
            $field->setAttribute("fx-proxy-type", "previousElementSibling");
        }

        if ($fluxType === 'SingleSelect') {
            $field->setAttribute("fx-event", "change");
            $field->setAttribute("fx-proxy", "input[type='hidden']");
            $field->setAttribute("fx-proxy-type", "default");
        }

        // $field->setAttribute("fx-bind", $value); // class to bind on the front end
        // $field->setAttribute("fx-type", $fluxType);


        return $field;
    }

    /**
     * Call this at the end of getCMSFields() if you're modifying fields after parent::getCMSFields()
     */
    public function applyFluxAttributes(FieldList $fields): void
    {
        $this->setFluxFields($fields);
    }
}
