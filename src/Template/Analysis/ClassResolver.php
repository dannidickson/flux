<?php

namespace Flux\Template\Analysis;

/**
 * Resolves a field to a class.
 *
 * Basically "is `$Title` a field on this class" OR "what class does this loop point at",
 * via a {@see SchemaInspector}.
 */
class ClassResolver
{

    private readonly SchemaInspector $schema;

    public function __construct(SchemaInspector $schema)
    {
        $this->schema = $schema;
    }

    public function isField(?string $class, string $field): bool
    {
        if ($class === null) {
            return false;
        }

        return array_key_exists($field, $this->schema->db($class))
            || array_key_exists($field, $this->schema->hasOne($class));
    }

    /**
     * Item class a `<% loop $relation %>` iterates; null if not a list relation or unresolvable (opaque).
     */
    public function loopItemClass(?string $class, string $relation): ?string
    {
        if ($class === null) {
            return null;
        }

        $relations = array_merge(
            $this->schema->hasMany($class),
            $this->schema->manyMany($class)
        );

        if (array_key_exists($relation, $relations)) {
            return $this->relationClass($relations[$relation]);
        }

        return null;
    }

    /**
     * `<% with $relation %>`
     * Returns null if the $relation is not a hasone
     */
    public function withClass(?string $class, string $relation): ?string
    {
        if ($class === null) {
            return null;
        }

        $hasOne = $this->schema->hasOne($class);

        if (array_key_exists($relation, $hasOne)) {
            return $this->relationClass($hasOne[$relation]);
        }

        return null;
    }

    /**
     * Normalise a relation to a class name: unwrap `many_many through`
     * arrays and `Class.Relation` dot-notation, and verify the class exists.
     */
    private function relationClass(mixed $spec): ?string
    {
        if (is_array($spec)) {
            $spec = $spec['through'] ?? null;
        }

        if (!is_string($spec)) {
            return null;
        }

        if (str_contains($spec, '.')) {
            $spec = explode('.', $spec)[0];
        }

        if (!$this->schema->classExists($spec)) {
            return null;
        }

        return $spec;
    }

}
