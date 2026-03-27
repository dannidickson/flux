<?php

namespace Flux\Service;

use Flux\Repository\FluxRepository;
use SilverStripe\Core\ClassInfo;
use SilverStripe\Forms\GridField\GridField;
use SilverStripe\ORM\DataObject;

/**
 * Centralized service for managing FluxConfig data
 * Collects Page, Element, and Field data throughout the request lifecycle
 * and outputs window.FluxConfig once at the end
 */
class FluxConfigService
{
    /**
     * Flat array of segments (Page, Elements, etc.)
     * @var array
     */
    private static $segments = [];

    /**
     * Fields grouped by ClassName
     * @var array
     */
    private static $fields = [];

    /**
     * Relation fields grouped by ClassName → relation name
     * Populated from flux_relation_fields config
     * @var array
     */
    private static $relationFields = [];

    /**
     * Set the page data for FluxConfig and collect its fields
     * Page is added as the first segment
     *
     * @param DataObject $page
     */
    public static function setPage(DataObject $page): void
    {
        $segmentData = [
            'Type' => 'Page',
            'ID' => $page->ID ?? '',
            'ClassName' => get_class($page),
        ];

        self::addSegment($segmentData);

        self::collectFieldsFromDataObject($page);
        self::collectRelationFieldsFromDataObject($page);
    }

    /**
     * Add an element to FluxConfig and collect its fields
     * Elements are added as segments with Type: 'Element'
     *
     * @param DataObject $element
     */
    public static function addElement(DataObject $element): void
    {
        $segmentData = [
            'Type' => 'Element',
            'ID' => (string) $element->ID,
            'ClassName' => get_class($element),
        ];

        // Add owner if available (e.g., for BaseElement anchor)
        if ($element->hasMethod('getOwnerTarget')) {
            $segmentData['owner'] = $element->getOwnerTarget();
        }

        self::addSegment($segmentData);

        self::collectFieldsFromDataObject($element);
        self::collectRelationFieldsFromDataObject($element);
    }

    /**
     * Add a segment to the flat segments array
     * Avoids duplicates based on ID and ClassName
     *
     * @param array $segmentData
     */
    private static function addSegment(array $segmentData): void
    {
        // Avoid duplicates
        foreach (self::$segments as $existing) {
            if ($existing['ID'] === $segmentData['ID'] && $existing['ClassName'] === $segmentData['ClassName']) {
                return;
            }
        }

        self::$segments[] = $segmentData;
    }

    /**
     * Add multiple elements from a list
     *
     * @param iterable $elements
     */
    public static function addElements(iterable $elements): void
    {
        foreach ($elements as $element) {
            self::addElement($element);
        }
    }

    /**
     * Collect relation field configs from a DataObject's flux_relation_fields config.
     */
    private static function collectRelationFieldsFromDataObject(DataObject $dataObject): void
    {
        $fluxRelationFields = $dataObject->config()->get('flux_relation_fields');

        if (!$fluxRelationFields || !$dataObject->hasMethod('getCMSFields')) {
            return;
        }

        $className = get_class($dataObject);

        $cmsGridFields = [];
        foreach ($dataObject->getCMSFields()->dataFields() as $field) {
            if ($field instanceof GridField) {
                $cmsGridFields[$field->getName()] = $field;
            }
        }

        foreach ($fluxRelationFields as $relationName => $config) {
            $gridField = $cmsGridFields[$relationName] ?? null;

            if (!$gridField) {
                continue;
            }

            if (is_string($config)) {
                $selector = $config;
                $explicitFields = null;
            } else {
                $selector = $config['DOMSelector'] ?? null;
                $explicitFields = $config['Fields'] ?? null;
            }

            if (!$selector) {
                continue;
            }

            $actions = [];
            foreach ($gridField->getConfig()->getComponents() as $component) {
                $componentClass = get_class($component);
                if (str_contains($componentClass, 'GridFieldEditButton')) {
                    $actions[] = 'edit';
                } elseif (str_contains($componentClass, 'GridFieldArchiveAction')) {
                    $actions[] = 'archive';
                } elseif (str_contains($componentClass, 'GridFieldDeleteAction')) {
                    $actions[] = 'delete';
                }
            }

            if (empty($actions)) {
                continue;
            }

            $fields = self::resolveRelationFields($dataObject, $relationName, $explicitFields);
            $ids = array_values($dataObject->$relationName()->column('ID'));

            if (!isset(self::$relationFields[$className])) {
                self::$relationFields[$className] = [];
            }

            self::$relationFields[$className][$relationName] = [
                'selector' => $selector,
                'actions' => $actions,
                'ids' => $ids,
                'Fields' => $fields,
            ];
        }
    }

    /**
     * Resolve child field bindings for a relation.
     */
    private static function resolveRelationFields(DataObject $dataObject, string $relationName, ?array $explicitFields): array
    {
        $relatedClass = self::resolveRelationClass($dataObject, $relationName);

        if (!$relatedClass) {
            return [];
        }

        $relatedSingleton = singleton($relatedClass);
        $fieldMap = $explicitFields ?? ($relatedSingleton->config()->get('flux_fields') ?? []);

        $fields = [];
        foreach ($fieldMap as $fieldName => $bind) {
            $type = FluxRepository::getFluxDataType($fieldName, $relatedSingleton->config());
            if (!$type) {
                continue;
            }
            $fields[$fieldName] = ['bind' => $bind, 'type' => $type];
        }

        return $fields;
    }

    /**
     * Resolve the related DataObject class for a has_many or many_many relation.
     */
    private static function resolveRelationClass(DataObject $dataObject, string $relationName): ?string
    {
        $config = $dataObject->config();
        $relations = array_merge(
            $config->get('has_many') ?? [],
            $config->get('many_many') ?? [],
        );

        $relatedClass = $relations[$relationName] ?? null;

        if (is_array($relatedClass)) {
            $relatedClass = $relatedClass['through'] ?? null;
        }

        if (!$relatedClass) {
            return null;
        }

        if (str_contains($relatedClass, '.')) {
            $relatedClass = explode('.', $relatedClass)[0];
        }

        return class_exists($relatedClass) ? $relatedClass : null;
    }

    private static function collectFieldsFromDataObject(DataObject $dataObject): void
    {
        $config = $dataObject->config();
        $fluxFields = $config->get('flux_fields');

        if (!$fluxFields) {
            return;
        }

        $className = get_class($dataObject);

        if (!isset(self::$fields[$className])) {
            self::$fields[$className] = [];
        }

        foreach ($fluxFields as $key => $value) {
            $fluxType = FluxRepository::getFluxDataType($key, $config);

            if (!$fluxType) {
                continue;
            }

            self::$fields[$className][$key] = [
                'key' => $key,
                'bind' => $value,
                'type' => $fluxType,
            ];
        }
    }

    /**
     * Get the complete FluxConfig array
     * Segments is a flat, iterable array for easy looping
     *
     * @return array
     */
    public static function getConfig(): array
    {
        return [
            'Segments' => self::$segments,
            'Fields' => self::$fields,
            'RelationFields' => self::$relationFields,
            'ChangeSet' => (object) [],
            'Events' => [],
        ];
    }

    /**
     * Check if any config data has been set
     *
     * @return bool
     */
    public static function hasConfig(): bool
    {
        return !empty(self::$segments) ?? !empty(self::$elements);
    }

    /**
     * Clear all config data
     * Should be called at the start of each request context
     */
    public static function clear(): void
    {
        self::$segments = [];
        self::$fields = [];
        self::$relationFields = [];
    }

    /**
     * Reset the service for a new context
     * Clears existing data to prevent cross-contamination between requests
     */
    public static function reset(): void
    {
        self::clear();
    }
}
