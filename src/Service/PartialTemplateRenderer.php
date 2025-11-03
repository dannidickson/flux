<?php

namespace Flux\Service;

use DOMDocument;
use DOMXPath;
use DOMElement;
use SilverStripe\Core\Injector\Injectable;

/**
 * Used to extract the partial updates. 'patches'  based on field dependencies
 *
 * Taking the full HTML we check for 'FLUX:' markers to get
 * the HTML elements that should be re-rendered based on changed fields.
 *
 * If a changed field is not within the 'patches' array we will remove it from the front end
 *
 * Format: <!-- FLUX_START:type:field -->...<!-- FLUX_END:type:field -->
 */
class PartialTemplateRenderer
{
    use Injectable;

    /**
     * Extract blocks that depend on the changed fields
     *
     * @param string $fullHtml
     * @param array $changedFields
     * @param array $fluxFields
     * @return array
     * @example
     *   [
     *     'FieldName' => [
     *       'type' => 'loop' or 'if',
     *       'html' => '<div>...</div>',
     *       'selector' => '.selector' or null,
     *       'dependencies' => ['Field1']
     *     ]
     *   ]
     */
    public function extractChangedBlocks(string $fullHtml, array $changedFields, array $fluxFields = []): array
    {
        if (empty($fullHtml) || empty($changedFields)) {
            return [];
        }

        $changedBlocks = [];

        // Pattern: <!-- FLUX_START::type:field -->...<!-- FLUX_END::type:field -->
        $pattern = '/<!-- FLUX_START::([^:]+):([^ ]*) -->(.*?)<!-- FLUX_END::\1:\2 -->/s';

        if (preg_match_all($pattern, $fullHtml, $matches, PREG_SET_ORDER)) {
            foreach ($matches as $match) {
                $type = $match[1];
                $field = $match[2]; // Plain text field name
                $html = $match[3];

                $dependencies = !empty($field) ? [$field] : [];

                // Check if this block depends on any changed field
                if ($this->hasMatchingDependency($dependencies, $changedFields)) {
                    $selector = $fluxFields[$field] ?? null;

                    // Use field name as key for 'uniqueness'
                    $changedBlocks[$field] = [
                        'type' => $type,
                        'html' => trim($html),
                        'selector' => $selector,
                        'dependencies' => $dependencies,
                    ];
                }
            }
        }

        return $changedBlocks;
    }

    /**
     * Get all FLUX markers from rendered HTML
     */
    public function getAllBlocks(string $fullHtml, array $fluxFields = []): array
    {
        if (empty($fullHtml)) {
            return [];
        }

        $allBlocks = [];

        // Pattern: <!-- FLUX_START::type:field -->...<!-- FLUX_END::type:field -->
        $pattern = '/<!-- FLUX_START::([^:]+):([^ ]*) -->(.*?)<!-- FLUX_END::\1:\2 -->/s';

        if (preg_match_all($pattern, $fullHtml, $matches, PREG_SET_ORDER)) {
            foreach ($matches as $match) {
                $type = $match[1];
                $field = $match[2]; // Plain text field name
                $html = $match[3];

                $dependencies = !empty($field) ? [$field] : [];

                $selector = $fluxFields[$field] ?? null;

                $allBlocks[$field] = [
                    'type' => $type,
                    'html' => trim($html),
                    'selector' => $selector,
                    'dependencies' => $dependencies,
                ];
            }
        }

        return $allBlocks;
    }

    /**
     * Extract elements using CSS selectors from flux_fields configuration
     */
    public function extractBySelectors(string $html, array $changedFields, array $fluxFields, array $existingBlocks = []): array
    {
        if (empty($html) || empty($changedFields) || empty($fluxFields)) {
            return [];
        }

        $extractedBlocks = [];
        $dom = $this->loadHTML($html);

        if (!$dom) {
            return [];
        }

        $xpath = new DOMXPath($dom);

        foreach ($changedFields as $fieldName => $value) {
            if (isset($existingBlocks[$fieldName])) {
                continue;
            }

            if (!isset($fluxFields[$fieldName])) {
                continue;
            }

            $selector = $fluxFields[$fieldName];

            // Change the querySelector to XPath
            // @todo: 8.4 includes a nicer HTMLDocument, which can do a lot of this for us
            $xpathQuery = $this->cssToXPath($selector);

            $elements = $xpath->query($xpathQuery);

            if ($elements && $elements->length > 0) {
                $element = $elements->item(0);
                $elementHtml = $dom->saveHTML($element);

                $extractedBlocks[$selector] = [
                    'type' => 'selector',
                    'html' => trim($elementHtml),
                    'selector' => $selector,
                    'dependencies' => [$fieldName],
                ];
            }
        }

        return $extractedBlocks;
    }

    /**
     * Convert simple CSS selectors to XPath
     * Supports: .class, #id, tag, [attribute="value"]
     *
     * @param string $selector CSS selector
     * @return string XPath query
     */
    protected function cssToXPath(string $selector): string
    {
        // Simple class selector: .class-name
        if (preg_match('/^\.([a-zA-Z0-9_-]+)$/', $selector, $matches)) {
            return "//*[contains(concat(' ', normalize-space(@class), ' '), ' {$matches[1]} ')]";
        }

        // Simple ID selector: #id
        if (preg_match('/^#([a-zA-Z0-9_-]+)$/', $selector, $matches)) {
            return "//*[@id='{$matches[1]}']";
        }

        // Tag selector: div
        if (preg_match('/^([a-zA-Z0-9]+)$/', $selector)) {
            return "//{$selector}";
        }

        // Attribute selector: [fx-key="Title"]
        if (preg_match('/^\[([a-zA-Z0-9_-]+)=["\']([^"\']+)["\']\]$/', $selector, $matches)) {
            return "//*[@{$matches[1]}='{$matches[2]}']";
        }

        // Fallback: try to handle it as a basic tag
        return "//*";
    }

    /**
     * Check if any dependencies match the changed fields
     */
    protected function hasMatchingDependency(array $dependencies, array $changedFields): bool
    {
        $changedFieldNames = array_keys($changedFields);
        return !empty(array_intersect($dependencies, $changedFieldNames));
    }

    /**
     * Load HTML into DOMDocument with proper error handling
     */
    protected function loadHTML(string $html): ?DOMDocument
    {
        $dom = new DOMDocument('1.0', 'UTF-8');

        $previousErrorSetting = libxml_use_internal_errors(true);

        $htmlWithEncoding = '<?xml encoding="UTF-8">' . $html;

        $success = $dom->loadHTML(
            $htmlWithEncoding,
            LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD
        );

        libxml_clear_errors();
        libxml_use_internal_errors($previousErrorSetting);

        return $success ? $dom : null;
    }

    /**
     * Get the HTML content of a flux-marker element
     */
    protected function getMarkerHtml(DOMDocument $dom, DOMElement $marker): string
    {
        return $dom->saveHTML($marker) ?: '';
    }

    /**
     * Strip FLUX comment markers from HTML (for final output)
     */
    public function stripMarkers(string $html): string
    {
        // Remove FLUX comment markers but keep content
        $html = preg_replace('/<!-- FLUX_START::[^>]+-->/', '', $html);
        $html = preg_replace('/<!-- FLUX_END::[^>]+-->/', '', $html);

        return $html;
    }

    /**
     * Count the number of FLUX comment blocks in HTML
     */
    public function countBlocks(string $html): int
    {
        return substr_count($html, '<!-- FLUX_START::');
    }

    /**
     * Extract a specific container from HTML using a CSS selector
     *
     * This is used for returning only the morphable container (like #app or body)
     * instead of the entire HTML document, which would be used for a entire page morph.
     */
    public function extractContainer(string $html, string $selector): ?string
    {
        if (empty($html) || empty($selector)) {
            return null;
        }

        $dom = $this->loadHTML($html);
        if (!$dom) {
            return null;
        }

        $xpath = new DOMXPath($dom);
        $xpathQuery = $this->cssToXPath($selector);
        $elements = $xpath->query($xpathQuery);

        if ($elements && $elements->length > 0) {
            $element = $elements->item(0);
            return $dom->saveHTML($element);
        }

        return null;
    }
}
