<?php

namespace Flux\Template\Analysis;

/**
 * The outcome of analysing one class's templates: the {@see FieldBinding}s that
 * resolved to selectors, and the {@see SkipReport}s for candidates that didn't.
 */
final class AnalysisResult
{

    /** @var FieldBinding[] */
    public readonly array $bindings;

    /** @var SkipReport[] */
    public readonly array $skips;

    /** @var RelationBinding[] */
    public readonly array $relations;

    /**
     * @param FieldBinding[] $bindings
     * @param SkipReport[] $skips
     * @param RelationBinding[] $relations
     */
    public function __construct(array $bindings = [], array $skips = [], array $relations = [])
    {
        $this->bindings = $bindings;
        $this->skips = $skips;
        $this->relations = $relations;
    }

    /**
     * The resolved relation loops, keyed by relation name.
     *
     * @return array<string, RelationBinding>
     */
    public function relationsByName(): array
    {
        $byName = [];

        foreach ($this->relations as $relation) {
            $byName[$relation->relation] = $relation;
        }

        return $byName;
    }

    /**
     * Bindings in a given scope, keyed by field name (later occurrences win).
     *
     * @return array<string, FieldBinding>
     */
    public function bindingsInScope(string $scope = FieldBinding::SCOPE_PAGE): array
    {
        $byField = [];

        foreach ($this->bindings as $binding) {
            if ($binding->scope !== $scope) {
                continue;
            }

            $byField[$binding->field] = $binding;
        }

        return $byField;
    }

}
