<?php

namespace Flux\Template\Analysis;

/**
 * Locates the source of an `<% include Name %>` by template name.
 * {@see ThemeIncludeLocator} is the production impl; tests use an in-memory map.
 */
interface IncludeLocator
{

    /** Template source for $name, or null when no such include exists. */
    public function load(string $name): ?string;

}
