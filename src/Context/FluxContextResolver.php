<?php

namespace Flux\Context;

use Flux\Schema\FluxSchema;
use SilverStripe\Admin\LeftAndMain;
use SilverStripe\Forms\GridField\GridField;
use SilverStripe\ORM\CMSPreviewable;
use SilverStripe\ORM\DataObject;
use Symbiote\GridFieldExtensions\GridFieldOrderableRows;

/**
 * Single source of truth for "what is being edited right now".
 *
 * Three entry points:
 *  - forLeftAndMain(): used by FluxLeftAndMainExtension to build the bootstrap.
 *  - forRecord(): used by the /flux/context endpoint after looking up the record
 *    that the preview iframe says it is rendering.
 *  - empty(): explicit zero state.
 */
class FluxContextResolver
{
    public function __construct(private FluxSchema $schema = new FluxSchema())
    {
    }

    public function forLeftAndMain(LeftAndMain $admin): FluxContext
    {
        $record = $admin->currentRecord();
        if (!$record || !$record->exists()) {
            return FluxContext::empty();
        }
        return $this->forRecord($record);
    }

    /**
     * Build a context for an item being edited inside a GridFieldDetailForm.
     * The caller (FluxGridDetailFormExtension) already has the item, the
     * parent record, and the relation name from its own framework hook —
     * we don't need to dig them out of the URL.
     */
    public function forGridFieldItem(DataObject $item, DataObject $parent, string $relationName): FluxContext
    {
        // Elemental block edit — share the page-aware block context so the
        // frame sees the element with its owner anchor (#e{id}).
        if ($parent->hasMethod('ElementalArea') && $relationName === 'ElementalArea') {
            return $this->getBlockContext($item, $parent);
        }
        return $this->getRelationItemInPageContext($item, $parent, $relationName);
    }

    public function forRecord(DataObject $record, ?int $itemID = null): FluxContext
    {
        // Editing a specific block within a page's ElementalArea.
        if ($itemID && $record->hasMethod('ElementalArea')) {
            $element = $record->ElementalArea()->Items()->byID($itemID);
            if ($element instanceof DataObject && $element->exists()) {
                return $this->getBlockContext($element, $record);
            }
        }

        // Top-level page edit — anything renderable in the CMS preview frame.
        if ($record instanceof CMSPreviewable || $record->hasExtension(CMSPreviewable::class)) {
            return $this->getPageContext($record);
        }

        // Any other DataObject — ModelAdmin row, GridField detail form, etc.
        return $this->getRelationItemContext($record);
    }

    /**
     * Relation item being edited inside a GridField on a parent page.
     * The preview frame is showing the parent page's render, so the item's
     * own row inside that render is the "stage" we want to open.
     */
    private function getRelationItemInPageContext(DataObject $item, DataObject $parent, string $relationName): FluxContext
    {
        $segments = [
            $this->pageSegment($parent),
            [
                'Type' => 'RelationItem',
                'ClassName' => get_class($item),
                'ID' => (string) $item->ID,
                'owner' => (string) $item->ID,
                'editLink' => $this->editLinkFor($item),
                'relation' => $relationName,
            ],
        ];

        $schema = $this->schema->forClasses([get_class($parent), get_class($item)]);
        $this->addRelationsFromGridFields($parent, $schema);

        $context = new FluxContext(
            scopeKind: FluxContext::SCOPE_RELATION_ITEM,
            scopeOwnerId: (string) $item->ID,
            segments: $segments,
            schema: $schema,
            pageId: (int) $parent->ID,
            pageClass: get_class($parent),
        );

        $parent->extend('updateFluxContext', $context);
        return $context;
    }

    private function getPageContext(DataObject $page): FluxContext
    {
        $segments = [$this->pageSegment($page)];
        $classes = [get_class($page)];

        foreach ($this->elementsOf($page) as $element) {
            $segments[] = $this->elementSegment($element);
            $classes[] = get_class($element);
        }

        $schema = $this->schema->forClasses($classes);
        $this->addRelationsFromGridFields($page, $schema);

        $context = new FluxContext(
            scopeKind: FluxContext::SCOPE_PAGE,
            scopeOwnerId: null,
            segments: $segments,
            schema: $schema,
            pageId: $page->ID,
            pageClass: get_class($page),
        );

        // Extension point for modules that need to contribute dynamic, per-record
        // relation field definitions (e.g. UserForms field idMaps).
        $page->extend('updateFluxContext', $context);

        return $context;
    }

    /**
     * Layer per-record runtime data onto the static relation schema. The
     * FluxSchema slice only knows the YAML-declared selectors/fields; it can't
     * know the live row IDs or which CMS actions a GridField exposes. Without
     * the IDs the preview frame has nothing to map its DOM rows onto, so it
     * can't tag relation items with fx-owner/fx-key — i.e. live editing of
     * GridField DataObjects does nothing. We restore that here now that we
     * have the actual record in hand.
     *
     * For each relation we attach:
     *  - `ids`      — the relation's row IDs, in query order (matched against
     *                 DOM order by the frame's index-based annotator).
     *  - `actions`  — edit/archive/delete, derived from the GridField's
     *                 components.
     *  - `sortField`— for sortable relations, the GridFieldOrderableRows field.
     */
    private function addRelationsFromGridFields(DataObject $record, array &$schema): void
    {
        $className = get_class($record);
        $relations = $schema[$className]['RelationFields'] ?? [];

        if (empty($relations) || !$record->hasMethod('getCMSFields')) {
            return;
        }

        // Index the record's GridFields by relation name once.
        $gridFields = [];
        foreach ($record->getCMSFields()->dataFields() as $field) {
            if ($field instanceof GridField) {
                $gridFields[$field->getName()] = $field;
            }
        }

        foreach ($relations as $relationName => $relation) {
            // Relations driven by an explicit idMap (e.g. UserForms fields) carry
            // their own DOM mapping and don't need positional row IDs.
            if (!empty($relation['idMap'])) {
                continue;
            }

            if ($record->hasMethod($relationName)) {
                $schema[$className]['RelationFields'][$relationName]['ids'] =
                    array_values($record->$relationName()->column('ID'));
            }

            $grid = $gridFields[$relationName] ?? null;
            if (!$grid) {
                continue;
            }

            $schema[$className]['RelationFields'][$relationName]['actions'] =
                $this->actionsForGridField($grid);

            if (!empty($relation['sortable'])) {
                $orderable = $grid->getConfig()->getComponentByType(GridFieldOrderableRows::class);
                if ($orderable) {
                    $schema[$className]['RelationFields'][$relationName]['sortField'] =
                        $orderable->getSortField();
                }
            }
        }
    }

    /**
     * Derive the available row actions from a GridField's components. Matched
     * by class-name substring so we don't hard-depend on optional modules
     * (e.g. the Versioned archive action) that may not be installed.
     *
     * @return array<int, string>
     */
    private function actionsForGridField(GridField $grid): array
    {
        $actions = [];
        foreach ($grid->getConfig()->getComponents() as $component) {
            $componentClass = get_class($component);
            if (str_contains($componentClass, 'GridFieldEditButton')) {
                $actions[] = 'edit';
            } elseif (str_contains($componentClass, 'GridFieldArchiveAction')) {
                $actions[] = 'archive';
            } elseif (str_contains($componentClass, 'GridFieldDeleteAction')) {
                $actions[] = 'delete';
            }
        }
        return $actions;
    }

    private function getBlockContext(DataObject $element, DataObject $page): FluxContext
    {
        $segments = [
            $this->pageSegment($page),
            $this->elementSegment($element),
        ];

        $ownerId = $element->hasMethod('getOwnerTarget')
            ? $element->getOwnerTarget()
            : '#e' . $element->ID;

        $schema = $this->schema->forClasses([get_class($page), get_class($element)]);
        // The block may render its own relations (e.g. a Product carousel);
        // those rows need live IDs too, not just the page-level relations.
        $this->addRelationsFromGridFields($element, $schema);

        return new FluxContext(
            scopeKind: FluxContext::SCOPE_BLOCK,
            scopeOwnerId: $ownerId,
            segments: $segments,
            schema: $schema,
            pageId: (int) $page->ID,
            pageClass: get_class($page),
        );
    }

    private function getRelationItemContext(DataObject $record): FluxContext
    {
        $segments = [[
            'Type' => 'RelationItem',
            'ClassName' => get_class($record),
            'ID' => (string) $record->ID,
        ]];

        return new FluxContext(
            scopeKind: FluxContext::SCOPE_RELATION_ITEM,
            scopeOwnerId: (string) $record->ID,
            segments: $segments,
            schema: $this->schema->forClasses([get_class($record)]),
        );
    }

    private function pageSegment(DataObject $page): array
    {
        return [
            'Type' => 'Page',
            'ClassName' => get_class($page),
            'ID' => (string) $page->ID,
            'editLink' => $this->editLinkFor($page),
        ];
    }

    private function elementSegment(DataObject $element): array
    {
        $segment = [
            'Type' => 'Element',
            'ClassName' => get_class($element),
            'ID' => (string) $element->ID,
            'editLink' => $this->editLinkFor($element),
        ];

        if ($element->hasMethod('getOwnerTarget')) {
            $segment['owner'] = $element->getOwnerTarget();
        }

        return $segment;
    }

    /**
     * Resolve the CMS edit URL for a record using the standard SS contract.
     * Records that don't implement CMSEditLink() get null and the frame
     * falls back to "Edit" (toggle) only.
     */
    private function editLinkFor(DataObject $record): ?string
    {
        if (!$record->hasMethod('CMSEditLink')) {
            return null;
        }
        $link = $record->CMSEditLink();
        return $link ?: null;
    }

    /**
     * @return iterable<DataObject>
     */
    private function elementsOf(DataObject $page): iterable
    {
        if (!$page->hasMethod('ElementalArea') || !$page->ElementalArea()->exists()) {
            return [];
        }

        return $page->ElementalArea()->Elements();
    }
}
