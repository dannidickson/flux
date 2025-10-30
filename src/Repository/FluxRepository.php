<?php

namespace Flux\Repository;

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
