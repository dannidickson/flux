<?php

namespace Flux\Schema;

use SilverStripe\Core\Config\Config;
use SilverStripe\Core\Config\Config_ForClass;
use SilverStripe\ORM\DataObject;

/**
 * Read-only view over the flux_fields/flux_fieldtypes/flux_relation_fields
 * config for a DataObject class.
 */
class FluxSchema
{

    /**
     * Schema slice for a single class.
     *
     * @return array{Fields: array, RelationFields: array}
     */
    public function forClass(string $className): array
    {
        if (!class_exists($className) || !is_subclass_of($className, DataObject::class)) {
            return ['Fields' => [], 'RelationFields' => []];
        }

        $config = Config::forClass($className);

        return [
            'Fields' => $this->collectFields($config),
            'RelationFields' => $this->collectRelationFields($config),
        ];
    }

    /**
     * Schema slice for multiple classes, keyed by class name.
     */
    public function forClasses(array $classNames): array
    {
        $out = [];

        foreach (array_unique($classNames) as $class) {
            $out[$class] = $this->forClass($class);
        }

        return $out;
    }

    private function collectFields(Config_ForClass $config): array
    {
        $fluxFields = $config->get('flux_fields');

        if (!$fluxFields) {
            return [];
        }

        $fields = [];

        foreach ($fluxFields as $key => $entry) {
            $type = self::dataTypeFor($key, $config);

            if (!$type) {
                continue;
            }

            [$bind, $updateMode] = self::normaliseBind($entry);

            $fields[$key] = [
                'key' => $key,
                'bind' => $bind,
                'type' => $type,
                'updateMode' => $updateMode,
            ];
        }

        return $fields;
    }

    /**
     * A 'flux_fields' entry can have two implementations.
     *
     * 1. '.dom-selector-class'
     * 2. [ DOMSelector: '.dom-selector-class', UpdateMode: ['templateUpdate' / 'patchTemplate' ]]
     *
     * This checks and normalise it
     *
     * @return array{0: ?string, 1: string} [selector, update mode]
     */
    public static function normaliseBind(string|array $entry): array
    {
        if (is_string($entry)) {
            return [$entry, UpdateMode::TEXT];
        }

        return [
            $entry['DOMSelector'] ?? null,
            $entry['UpdateMode'] ?? UpdateMode::TEXT,
        ];
    }

    /**
     * Returns relation field definitions without runtime data (no IDs, no actions).
     * Runtime data is layered on by FluxContextResolver when it has a DataObject.
     */
    private function collectRelationFields(Config_ForClass $config): array
    {
        $relationFields = $config->get('flux_relation_fields');

        if (!$relationFields) {
            return [];
        }

        $out = [];

        foreach ($relationFields as $relationName => $entry) {
            $dropZone = null;
            $sortable = false;

            if (is_string($entry)) {
                $selector = $entry;
                $explicitFields = null;
            } else {
                $selector = $entry['DOMSelector'] ?? null;
                $explicitFields = $entry['Fields'] ?? null;
                $dropZone = $entry['DropZone'] ?? null;
                $sortable = (bool) ($entry['Sortable'] ?? false);
            }

            if (!$selector) {
                continue;
            }

            $slice = [
                'selector' => $selector,
                'Fields' => $this->resolveRelationFields($config, $relationName, $explicitFields),
            ];

            if ($dropZone) {
                $slice['dropZone'] = $dropZone;
            }

            if ($sortable) {
                $slice['sortable'] = true;
            }

            $out[$relationName] = $slice;
        }

        return $out;
    }

    private function resolveRelationFields(
        Config_ForClass $config,
        string $relationName,
        ?array $explicitFields,
    ): array {
        $relatedClass = $this->resolveRelationClass($config, $relationName);

        if (!$relatedClass) {
            return [];
        }

        $relatedConfig = Config::forClass($relatedClass);
        $fieldMap = $explicitFields ?? ($relatedConfig->get('flux_fields') ?? []);

        $fields = [];

        foreach ($fieldMap as $fieldName => $entry) {
            $type = self::dataTypeFor($fieldName, $relatedConfig);

            if (!$type) {
                continue;
            }

            [$bind, $updateMode] = self::normaliseBind($entry);
            $fields[$fieldName] = ['bind' => $bind, 'type' => $type, 'updateMode' => $updateMode];
        }

        return $fields;
    }

    private function resolveRelationClass(Config_ForClass $config, string $relationName): ?string
    {
        $relations = array_merge(
            $config->get('has_many') ?? [],
            $config->get('many_many') ?? [],
        );

        $relatedClass = $relations[$relationName] ?? null;

        if (is_array($relatedClass)) {
            $relatedClass = $relatedClass['through'] ?? null;
        }

        if (!is_string($relatedClass)) {
            return null;
        }

        if (str_contains($relatedClass, '.')) {
            $relatedClass = explode('.', $relatedClass)[0];
        }

        if (!class_exists($relatedClass)) {
            return null;
        }

        return $relatedClass;
    }

    /**
     * The flux data type for a field. flux_fields only maps a field to the template,
     * so the type comes from flux_fieldtypes, else is inferred from db/has_one.
     * Returns null for fields that can't be edited.
     *
     * @TODO we can avoid the ->get() calls here by doing the merge before the function call
     */
    private static function dataTypeFor(string $key, Config_ForClass $config): ?string
    {
        $fluxFieldTypes = $config->get('flux_fieldtypes');

        if ($fluxFieldTypes && isset($fluxFieldTypes[$key])) {
            return $fluxFieldTypes[$key];
        }

        $configs = array_merge($config->get('db') ?? [], $config->get('has_one') ?? []);

        if (!isset($configs[$key])) {
            return null;
        }

        $type = $configs[$key];

        if (in_array($type, ['ForeignKey', 'PrimaryKey', 'Generated', 'PolymorphicForeignKey'], true)) {
            return null;
        }

        if (str_contains($type, 'HTML')) {
            return 'HTML';
        }

        if (str_contains($type, 'File') || str_contains($type, 'Image')) {
            return 'FileUpload';
        }

        // Can include Boolean and Boolean(0)
        if (str_contains($type, 'Boolean')) {
            return 'Boolean';
        }

        if (str_contains($type, 'Link')) {
            return 'LinkField';
        }

        return 'Text';
    }

}
