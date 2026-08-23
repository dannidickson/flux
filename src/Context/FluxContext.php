<?php

namespace Flux\Context;

use JsonSerializable;

/**
 * Snapshot of what is edited / being edited. FluxContextResolver builds the context
 * and sent to the client via the 'FluxApiController::context' endpoint
 */
final class FluxContext implements JsonSerializable
{

    public const string SCOPE_PAGE = 'page';
    public const string SCOPE_BLOCK = 'block';
    public const string SCOPE_RELATION_ITEM = 'relation-item';

    private array $extraRelationFields = [];

    public readonly string $scopeKind;

    public readonly ?string $scopeOwnerId;

    /** @var array<int, array{Type:string, ClassName:string, ID:string|int, owner?:string}> */
    public readonly array $segments;

    /** @var array<string, array{Fields:array, RelationFields:array}> */
    public readonly array $schema;

    public readonly ?int $pageId;

    public readonly ?string $pageClass;

    /**
     * @param array<int, array{Type:string, ClassName:string, ID:string|int, owner?:string}> $segments
     * @param array<string, array{Fields:array, RelationFields:array}> $schema
     */
    public function __construct(
        string $scopeKind,
        ?string $scopeOwnerId,
        array $segments,
        array $schema,
        ?int $pageId = null,
        ?string $pageClass = null,
    ) {
        $this->scopeKind = $scopeKind;
        $this->scopeOwnerId = $scopeOwnerId;
        $this->segments = $segments;
        $this->schema = $schema;
        $this->pageId = $pageId;
        $this->pageClass = $pageClass;
    }

    /**
     * Adds relations for fields that are not defined in YAML.
     * Typically merged over by the schema's RelationFields
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
        return $this->segments !== [];
    }

    /**
     * Provides a simple hint for the iframe to know what the scope and id of the thing
     * its editing is. Used during the bootstrapping state
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
                $schema[$className] = [
                    'Fields' => [],
                    'RelationFields' => [],
                ];
            }

            $schema[$className]['RelationFields'] = array_merge(
                $schema[$className]['RelationFields'] ?? [],
                $relations,
            );
        }

        $page = null;

        if ($this->pageId !== null) {
            $page = [
                'id' => $this->pageId,
                'class' => $this->pageClass,
            ];
        }

        return [
            'scope' => [
                'kind' => $this->scopeKind,
                'ownerId' => $this->scopeOwnerId,
            ],
            'page' => $page,
            'segments' => $this->segments,
            'schema' => $schema,
        ];
    }

}
