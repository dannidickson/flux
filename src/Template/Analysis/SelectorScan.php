<?php

namespace Flux\Template\Analysis;

/**
 * Result of scanning a scope's placeholder HTML, split by how each field renders.
 * Each value is a comma-joined CSS selector list covering every element the field
 * resolved to.
 */
final class SelectorScan
{

    /** @var array<string, string> field => selector list (element content) */
    public readonly array $selectors;

    /** @var array<string, string> field => selector list (embedded in an attribute) */
    public readonly array $attributeSelectors;

    /** @var array<string, string> field => why its carrying element yielded no usable selector */
    public readonly array $unresolved;

    public function __construct(array $selectors = [], array $attributeSelectors = [], array $unresolved = [])
    {
        $this->selectors = $selectors;
        $this->attributeSelectors = $attributeSelectors;
        $this->unresolved = $unresolved;
    }

}
