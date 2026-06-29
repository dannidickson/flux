<?php

namespace Flux\Context;

/**
 * Immutable snapshot of "what is being edited right now".
 *
 * Produced by FluxContextResolver. Consumed by:
 *  - FluxLeftAndMainExtension (inline bootstrap + PJAX fragment)
 *  - FluxApiController::context (preview frame fetches this)
 */
final class FluxContext implements \JsonSerializable
{
    public const SCOPE_PAGE = 'page';
    public const SCOPE_BLOCK = 'block';
    public const SCOPE_RELATION_ITEM = 'relation-item';

    /** @var array<string, array<string, array>> */
    private array $extraRelationFields = [];

    public function __construct(
        public readonly string $scopeKind,
        public readonly ?string $scopeOwnerId,
        /** @var array<int, array{Type:string, ClassName:string, ID:string|int, owner?:string}> */
        public readonly array $segments,
        /** @var array<string, array{Fields:array, RelationFields:array}> */
        public readonly array $schema,
        public readonly ?int $pageId = null,
        public readonly ?string $pageClass = null,
    ) {
    }

    /**
     * Allow extensions (e.g. UserForms) to contribute dynamic relation field
     * definitions that can't be expressed in the static YAML schema. Merged
     * over the schema's RelationFields when serialized.
     */
    public function addRelationField(string $className, string $relationName, array $config): void
    {
        if (!isset($this->extraRelationFields[$className])) {
            $this->extraRelationFields[$className] = [];
        }
        $this->extraRelationFields[$className][$relationName] = $config;
    }

    public static function empty(): self
    {
        return new self(self::SCOPE_PAGE, null, [], []);
    }

    public function hasContent(): bool
    {
        return !empty($this->segments);
    }

    /**
     * Distil this context into the smallest set of params the preview frame
     * needs to call `/flux/context` and get the same answer back. The CMS
     * host ships this hint to the frame so both sides converge on the same
     * scope without the frame having to guess.
     *
     * @return array{class:string,id:int,itemID?:int,relation?:string}|null
     */
    public function toContextHint(): ?array
    {
        if ($this->pageId === null || $this->pageClass === null) {
            return null;
        }

        $hint = ['class' => $this->pageClass, 'id' => $this->pageId];

        foreach ($this->segments as $segment) {
            if ($this->scopeKind === self::SCOPE_BLOCK && ($segment['Type'] ?? null) === 'Element') {
                $hint['itemID'] = (int) $segment['ID'];
                $hint['relation'] = 'ElementalArea';
                return $hint;
            }
            if (($segment['Type'] ?? null) === 'RelationItem') {
                $hint['itemID'] = (int) $segment['ID'];
                $hint['relation'] = $segment['relation'] ?? null;
                return $hint;
            }
        }

        return $hint;
    }

    public function jsonSerialize(): array
    {
        $schema = $this->schema;

        foreach ($this->extraRelationFields as $className => $relations) {
            if (!isset($schema[$className])) {
                $schema[$className] = ['Fields' => [], 'RelationFields' => []];
            }
            $schema[$className]['RelationFields'] = array_merge(
                $schema[$className]['RelationFields'] ?? [],
                $relations,
            );
        }

        return [
            'scope' => [
                'kind' => $this->scopeKind,
                'ownerId' => $this->scopeOwnerId,
            ],
            'page' => $this->pageId === null ? null : [
                'id' => $this->pageId,
                'class' => $this->pageClass,
            ],
            'segments' => $this->segments,
            'schema' => $schema,
        ];
    }
}
