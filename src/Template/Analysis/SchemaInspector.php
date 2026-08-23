<?php

namespace Flux\Template\Analysis;

/**
 * Read-only view of a DataObject's db/has_one/has_many/many_many config.
 * {@see ConfigSchemaInspector} is the production impl; tests use an in-memory one.
 */
interface SchemaInspector
{

    public function classExists(string $class): bool;

    /** @return array<string, string> fieldName => DBField spec */
    public function db(string $class): array;

    /** @return array<string, string> relationName => class */
    public function hasOne(string $class): array;

    /** @return array<string, mixed> relationName => class|through-spec */
    public function hasMany(string $class): array;

    /** @return array<string, mixed> relationName => class|through-spec */
    public function manyMany(string $class): array;

}
