<?php

namespace Flux\Tests\Template\Analysis;

use Flux\Template\Analysis\IncludeLocator;

/**
 * In-memory {@see IncludeLocator} for tests: maps include name => template
 * source, so include analysis runs without touching the theme filesystem.
 */
final class ArrayIncludeLocator implements IncludeLocator
{

    /** @var array<string, string> name => source */
    private readonly array $templates;

    /** @param array<string, string> $templates */
    public function __construct(array $templates = [])
    {
        $this->templates = $templates;
    }

    public function load(string $name): ?string
    {
        return $this->templates[$name] ?? null;
    }

}
