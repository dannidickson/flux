<?php

namespace Flux\Template\Analysis;

use SilverStripe\Core\Config\Config;

/**
 * The production {@see SchemaInspector}: reads a DataObject's `db` / `has_one` /
 * `has_many` / `many_many` straight from Silverstripe's config layer.
 */
final class ConfigSchemaInspector implements SchemaInspector
{

    /** @var array<string, array<string, array>> per-class config, keyed by db/has_one/has_many/many_many */
    private array $cache = [];

    public function classExists(string $class): bool
    {
        return class_exists($class);
    }

    public function db(string $class): array
    {
        return $this->config($class, 'db');
    }

    public function hasOne(string $class): array
    {
        return $this->config($class, 'has_one');
    }

    public function hasMany(string $class): array
    {
        return $this->config($class, 'has_many');
    }

    public function manyMany(string $class): array
    {
        return $this->config($class, 'many_many');
    }

    private function config(string $class, string $key): array
    {
        return $this->cache[$class][$key] ??= Config::inst()->get($class, $key) ?? [];
    }

}
