<?php

namespace Flux\Service;

use Flux\Repository\FluxRepository;
use SilverStripe\Core\ClassInfo;
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
            'ClassName' => ClassInfo::shortName($page),
        ];

        self::addSegment($segmentData);

        // Collect flux fields from the page
        self::collectFieldsFromDataObject($page);
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
            'ClassName' => ClassInfo::shortName($element),
        ];

        // Add owner if available (e.g., for BaseElement anchor)
        if ($element->hasMethod('getOwnerTarget')) {
            $segmentData['owner'] = $element->getOwnerTarget();
        }

        self::addSegment($segmentData);

        // Collect flux fields from the element
        self::collectFieldsFromDataObject($element);
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
     * Collect flux fields from a DataObject
     * Groups fields by ClassName for better organization
     *
     * @param DataObject $dataObject
     */
    private static function collectFieldsFromDataObject(DataObject $dataObject): void
    {
        $config = $dataObject->config();
        $fluxFields = $config->get('flux_fields');

        if (!$fluxFields) {
            return;
        }

        $className = ClassInfo::shortName($dataObject);

        // Initialize array for this class if not exists
        if (!isset(self::$fields[$className])) {
            self::$fields[$className] = [];
        }

        foreach ($fluxFields as $key => $value) {
            $fluxType = FluxRepository::getFluxDataType($key, $config);

            if (!$fluxType) {
                continue;
            }

            // Add field under this ClassName (owner is now at element level)
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
            'Segments' => self::$segments, // Flat array of segments
            'ChangeSet' => self::$fields, // Grouped by ClassName for lookup
            'Events' => [], // Reserved for future use
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
