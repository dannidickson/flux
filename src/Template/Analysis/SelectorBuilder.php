<?php

namespace Flux\Template\Analysis;

use DOMDocument;
use DOMElement;
use DOMText;

/**
 * Turns reconstructed HTML with `<flux-var>` placeholders into CSS selectors.
 * A field binds only when it's the sole meaningful child; unclassed elements are qualified
 * by their nearest classed ancestor.
 */
final class SelectorBuilder
{

    private const string PLACEHOLDER_TAG = 'flux-var';
    private const string FIELD_ATTR = 'data-field';

    /** Anonymous attribute marker: occupies space in the value, never binds. */
    public const string ATTR_MARKER = '__flux_attr__';

    /** Matches {@see attrMarker} tokens; field names are alphanumeric in Silverstripe. */
    private const string ATTR_MARKER_PATTERN = '/__flux_attr_([A-Za-z0-9]+)__/';

    /** Marker for a bindable field embedded in an attribute value. */
    public static function attrMarker(string $field): string
    {
        return '__flux_attr_' . $field . '__';
    }

    /**
     * Scan placeholder HTML and resolve each `<flux-var data-field>` and each
     * attribute marker to the selector of the element that carries it.
     */
    public function scan(string $html): SelectorScan
    {
        $doc = $this->loadDom($html);

        $content = [];
        $unresolved = [];

        foreach ($doc->getElementsByTagName(self::PLACEHOLDER_TAG) as $placeholder) {
            $field = $placeholder->getAttribute(self::FIELD_ATTR);

            if ($field === '') {
                continue; // inert placeholder (out-of-scope output), occupies space only
            }

            $parent = $placeholder->parentNode;

            if (!$parent instanceof DOMElement || !$this->isEffectivelySoleContent($parent)) {
                continue;
            }

            $selector = $this->buildSelector($parent, $doc, $detail);

            if ($selector === null) {
                $unresolved[$field] ??= (string) $detail;

                continue;
            }

            $content[$field][] = $selector;
        }

        $attribute = [];

        foreach ($doc->getElementsByTagName('*') as $element) {
            foreach ($element->attributes as $attr) {
                if (!preg_match_all(self::ATTR_MARKER_PATTERN, $attr->value, $matches)) {
                    continue;
                }

                $selector = $this->buildSelector($element, $doc, $detail);

                foreach ($matches[1] as $field) {
                    if ($selector === null) {
                        $unresolved[$field] ??= (string) $detail;

                        continue;
                    }

                    $attribute[$field][] = $selector;
                }
            }
        }

        return new SelectorScan(
            $this->joinSelectors($content),
            $this->joinSelectors($attribute),
            // A field that resolved somewhere else in the scope isn't unresolved.
            array_diff_key($unresolved, $content, $attribute),
        );
    }

    /**
     * The selector for the first element in a loop body
     *
     * @param string|null $detail out: why no selector could be built, when null is returned
     */
    public function itemSelector(string $html, ?string &$detail = null): ?string
    {
        $doc = $this->loadDom($html);
        $body = $doc->getElementsByTagName('body')->item(0);

        if (!$body) {
            $detail = 'empty loop body';

            return null;
        }

        foreach ($body->childNodes as $child) {
            if ($child instanceof DOMText && trim($child->textContent) === '') {
                continue;
            }

            if ($child instanceof DOMElement) {
                return $this->buildSelector($child, $doc, $detail);
            }
        }

        $detail = 'loop body has no wrapping element';

        return null;
    }

    /**
     * @param array<string, string[]> $byField
     * @return array<string, string>
     */
    private function joinSelectors(array $byField): array
    {
        return array_map(
            function (array $selectors) {
                return implode(', ', array_unique($selectors));
            },
            $byField,
        );
    }

    /**
     * A field is bindable only when it is the sole meaningful child of its
     * element; otherwise two fields would collapse onto one selector.
     */
    private function isEffectivelySoleContent(DOMElement $parent): bool
    {
        $meaningful = 0;

        foreach ($parent->childNodes as $child) {
            if ($child instanceof DOMText && trim($child->textContent) === '') {
                continue;
            }

            $meaningful++;
        }

        return $meaningful === 1;
    }

    /**
     * Prefers the element's own classes (`.a.b`), else qualifies its tag with the nearest
     * classed ancestor (`.card-body p`). Null when that would still be ambiguous.
     *
     * @param string|null $detail out: why no selector could be built, when null is returned
     */
    private function buildSelector(DOMElement $element, DOMDocument $doc, ?string &$detail = null): ?string
    {
        $detail = null;

        $classes = $this->classesOf($element);

        if ($classes !== []) {
            return '.' . implode('.', $classes);
        }

        $tag = strtolower($element->tagName);

        for ($ancestor = $element->parentNode; $ancestor instanceof DOMElement; $ancestor = $ancestor->parentNode) {
            $ancestorClasses = $this->classesOf($ancestor);

            if ($ancestorClasses === []) {
                continue;
            }

            $selector = '.' . implode('.', $ancestorClasses) . ' ' . $tag;

            if ($this->countMatches($doc, $ancestorClasses, $tag) > 1) {
                $detail = "ambiguous selector '" . $selector . "'";

                return null;
            }

            return $selector;
        }

        $detail = 'bare <' . $tag . '> with no classed ancestor';

        return null;
    }

    private function classesOf(DOMElement $element): array
    {
        if (!$element->hasAttribute('class')) {
            return [];
        }

        $classes = preg_split('/\s+/', trim($element->getAttribute('class')));

        if ($classes === false) {
            return [];
        }

        return array_values(array_filter($classes, function (string $class) {
            return $class !== '' && !str_contains($class, '__flux_attr');
        }));
    }

    /**
     * How many elements in the document `.<ancestorClasses> <tag>` would match.
     *
     * @param string[] $ancestorClasses
     */
    private function countMatches(DOMDocument $doc, array $ancestorClasses, string $tag): int
    {
        $count = 0;

        foreach ($doc->getElementsByTagName($tag) as $element) {
            for ($ancestor = $element->parentNode; $ancestor instanceof DOMElement; $ancestor = $ancestor->parentNode) {
                if (array_diff($ancestorClasses, $this->classesOf($ancestor)) === []) {
                    $count++;

                    break;
                }
            }
        }

        return $count;
    }

    private function loadDom(string $html): DOMDocument
    {
        $doc = new DOMDocument();
        libxml_use_internal_errors(true);
        $doc->loadHTML('<body>' . $html . '</body>', LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD);
        libxml_clear_errors();

        return $doc;
    }

}
