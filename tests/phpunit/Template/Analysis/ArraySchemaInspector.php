<?php

namespace Flux\Tests\Template\Analysis;

use Flux\Template\Analysis\SchemaInspector;

/**
 * In-memory {@see SchemaInspector} so the analyzer can run as plain PHPUnit, without
 * booting Silverstripe's ORM. Seed it with class => ['db' => …, 'has_one' => …, …].
 */
final class ArraySchemaInspector implements SchemaInspector
{

    /** @var array<string, array<string, array<string, mixed>>> */
    private readonly array $classes;

    /** @param array<string, array<string, array<string, mixed>>> $classes */
    public function __construct(array $classes = [])
    {
        $this->classes = $classes;
    }

    public function classExists(string $class): bool
    {
        return array_key_exists($class, $this->classes);
    }

    public function db(string $class): array
    {
        return $this->classes[$class]['db'] ?? [];
    }

    public function hasOne(string $class): array
    {
        return $this->classes[$class]['has_one'] ?? [];
    }

    public function hasMany(string $class): array
    {
        return $this->classes[$class]['has_many'] ?? [];
    }

    public function manyMany(string $class): array
    {
        return $this->classes[$class]['many_many'] ?? [];
    }

}
