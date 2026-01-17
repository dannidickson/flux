<?php

namespace Flux\Repository;

use SilverStripe\ORM\DataObject;

class FluxRepository
{
    /**
     * Get the flux data type for a field
     *
     * @TODO we can avoid the ->get() calls here by doing the merge before the function call
     */
    public static function getFluxDataType(string $key, mixed $dataObjectConfig): string
    {
        $dbConfig = $dataObjectConfig->get("db");
        $hasOneConfig = $dataObjectConfig->get("has_one");
        $configs = array_merge($dbConfig ?: [], $hasOneConfig ?: []);

        if (!isset($configs[$key])) {
            return false;
        }

        $type = $configs[$key];

        if (
            $type === "ForeignKey" ||
            $type === "PrimaryKey" ||
            $type === "Generated" ||
            $type === "PolymorphicForeignKey"
        ) {
            return false;
        }

        if (str_contains($type, "HTML")) {
            return "HTML";
        }

        if (str_contains($type, "File") || str_contains($type, "Image")) {
            return "FileUpload";
        }

        // Can include Boolean and Boolean(0)
        if (str_contains($type, "Boolean")) {
            return "Boolean";
        }

        if (str_contains($type, "")) {
            return "Text";
        }
    }

    public static function getFluxFieldConfig(DataObject $dataObject): array|bool
    {
        $dataObjectId = $dataObject->ID;
        $config = $dataObject->config();
        $pageData = $dataObject->data();
        $fluxFields = $config->get("flux_fields");

        // @ingore
        $fluxEvents = $config->get("flux_events");

        if (!$fluxFields) {
        return false;
        }

        $fluxConfig = [
            "ID" => $dataObjectId,
            "ClassName" => get_class($dataObject),
            "Fields" => [],
            "Events" => [],
            "Keys" => [],
        ];

        $fluxConfigFleids = [];
        $fluxFieldsKeys = [];
        foreach ($fluxFields as $key => $value) {
            $fluxType = FluxRepository::getFluxDataType($key, $config);

            if (!$fluxType) {
                continue;
            }

            $fluxFieldsKeys[] = $key;
            $fluxConfigFleids[$key] = [
                'key' => $key,
                'bind' => $value,
                'type' => $fluxType,
            ];

            $fluxConfig['Fields'] = $fluxConfigFleids;
            $fluxConfig['Keys'] = $fluxFieldsKeys;
        }

        return $fluxConfig;
    }

    /**
     * Get the event type for a flux data type
     */
    public static function getEventForType(string $type): string
    {
        return match ($type) {
            "Text", "HTML" => "keyup",
            "Boolean" => "click",
            "FileUpload" => "change",
            default => "change",
        };
    }
}
