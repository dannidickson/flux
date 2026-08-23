<?php

namespace Flux\Template\Analysis;

/**
 * A resolved `<% loop $Relation %>`: item wrapper selector plus the field bindings
 * found inside one iteration. Maps to flux_relation_fields[Relation].
 */
final class RelationBinding
{

    public readonly string $relation;

    public readonly string $class;

    public readonly ?string $itemSelector;

    /** @var FieldBinding[] */
    public readonly array $fields;

    /** @param FieldBinding[] $fields */
    public function __construct(string $relation, string $class, ?string $itemSelector, array $fields = [])
    {
        $this->relation = $relation;
        $this->class = $class;
        $this->itemSelector = $itemSelector;
        $this->fields = $fields;
    }

}
