import type {
    FluxConfigSegment,
    FluxConfigStructure,
    FluxRelationFieldConfig,
} from '../../types/flux.interface';
import { logger } from '../../core/logger';

export type FluxFieldType = 'Text' | 'HTML' | 'SingleSelectField' | 'LinkField';
export type FluxProxyType = 'previousElementSibling' | 'nextElementSibling' | 'self' | 'default';

export interface FluxDirective {
    readonly key: string;
    readonly event: string | null;
    readonly owner: string | null;
    readonly type: FluxFieldType | null;
    readonly proxySelector: string | null;
    readonly proxyType: FluxProxyType | null;
    readonly collectSelector: string | null;
    readonly element: HTMLElement;
}

export function fromElement(el: HTMLElement): FluxDirective | null {
    const key = el.getAttribute('fx-key');
    if (!key) return null;

    return {
        element: el,
        key,
        event: el.getAttribute('fx-event'),
        owner: el.getAttribute('fx-owner'),
        type: el.getAttribute('fx-type') as FluxFieldType | null,
        proxySelector: el.getAttribute('fx-proxy'),
        proxyType: el.getAttribute('fx-proxy-type') as FluxProxyType | null,
        collectSelector: el.getAttribute('fx-collect'),
    };
}

/**
 * Same directive, built from an attribute map rather than the element — for
 * fields whose attributes only exist in the form schema (see FluxFormSchema).
 */
export function fromAttributes(
    el: HTMLElement,
    attributes: Record<string, string>,
): FluxDirective | null {
    const key = attributes['fx-key'];
    if (!key) return null;

    return {
        element: el,
        key,
        event: attributes['fx-event'] ?? null,
        owner: attributes['fx-owner'] ?? null,
        type: (attributes['fx-type'] as FluxFieldType) ?? null,
        proxySelector: attributes['fx-proxy'] ?? null,
        proxyType: (attributes['fx-proxy-type'] as FluxProxyType) ?? null,
        collectSelector: attributes['fx-collect'] ?? null,
    };
}

export function getElementValue(el: HTMLElement): string {
    return (el as any).value ?? el.getAttribute('value') ?? '';
}

export function parse(root: HTMLElement | Document = document): FluxDirective[] {
    return Array.from(root.querySelectorAll('[fx-key]'))
        .map((el) => fromElement(el as HTMLElement))
        .filter((d): d is FluxDirective => d !== null);
}

export function applyConfig(config: FluxConfigStructure): void {
    const { Segments, Fields, RelationFields } = config;
    if (!Segments) return;

    for (const segment of Segments) {
        applySegmentFields(segment, Fields?.[segment.ClassName]);
        applySegmentRelations(segment, RelationFields?.[segment.ClassName]);
        applyOwnerEditLink(segment);
    }
}

function applyOwnerEditLink(segment: FluxConfigSegment): void {
    const editLink = (segment as any).editLink as string | undefined;
    if (!editLink || !segment.owner) return;

    let ownerEl: Element | null = null;
    try {
        ownerEl = document.querySelector(segment.owner);
    } catch {
        return;
    }
    if (ownerEl) {
        ownerEl.setAttribute("fx-edit-link", editLink);
    }
}

function applySegmentFields(
    segment: FluxConfigSegment,
    segmentFields: Record<string, any> | undefined,
): void {
    if (!segmentFields) return;

    for (const [, field] of Object.entries(segmentFields)) {
        const bindParts = String(field.bind).split(',').map((part: string) => part.trim());
        const selector = bindParts
            .map((part: string) => (segment.owner ? `${segment.owner} ${part}` : part))
            .join(', ');

        let elements: NodeListOf<Element> | null = null;
        try {
            elements = document.querySelectorAll(selector);
        } catch {
            logger.warn(`Flux: invalid selector for ${field.key}: ${selector} (relation-item fields are stamped via relation config)`);
            continue;
        }

        if (!elements.length) {
            logger.warn(`Flux: Cannot find element for: ${field.key} with selector: ${selector}`);
            continue;
        }

        elements.forEach((element) => {
            element.setAttribute('fx-key', field.key);
            element.setAttribute('fx-type', field.type);
            if (segment.owner) element.setAttribute('fx-owner', segment.owner);
        });
    }
}

function applySegmentRelations(
    _segment: FluxConfigSegment,
    segmentRelationFields: Record<string, FluxRelationFieldConfig> | undefined,
): void {
    if (!segmentRelationFields) return;

    for (const [relationName, relationField] of Object.entries(segmentRelationFields)) {
        if (relationField.idMap) {
            applyRelationById(relationName, relationField);
        } else {
            applyRelationByIndex(relationName, relationField);
        }
        applyRelationDropZone(relationName, relationField);
    }
}

function applyRelationDropZone(relationName: string, relationField: FluxRelationFieldConfig): void {
    if (!relationField.sortable || !relationField.dropZone) return;

    let zone: HTMLElement | null = null;
    try {
        zone = document.querySelector<HTMLElement>(relationField.dropZone);
    } catch {
        logger.warn(`Flux: invalid dropZone selector for ${relationName}: ${relationField.dropZone}`);
        return;
    }

    if (!zone) {
        logger.warn(`Flux: dropZone element not found for ${relationName}: ${relationField.dropZone}`);
        return;
    }

    zone.setAttribute('fx-sortable', '');
    zone.setAttribute('fx-grid-name', relationName);
    zone.setAttribute('fx-grid-item-selector', relationField.selector);
    if (relationField.sortField) {
        zone.setAttribute('fx-grid-sort-field', relationField.sortField);
    }
}

function applyRelationById(relationName: string, relationField: FluxRelationFieldConfig): void {
    for (const [id, selector] of Object.entries(relationField.idMap!)) {
        const el = document.querySelector<HTMLElement>(selector as string);
        if (!el) {
            logger.warn(`Flux: Cannot find element for ${relationName} ID ${id} with selector: ${selector}`);
            continue;
        }
        applyRelationAttributes(el, id, relationName, relationField);
    }
}

function applyRelationByIndex(relationName: string, relationField: FluxRelationFieldConfig): void {
    if (!relationField.selector) {
        logger.warn(`Flux: RelationField ${relationName} is missing a selector`);
        return;
    }

    const els = Array.from(document.querySelectorAll<HTMLElement>(relationField.selector));

    els.forEach((el, index) => {
        const id = relationField.ids?.[index];
        if (id === undefined) {
            logger.warn(`Flux: no record ID for ${relationName}[${index}] — DOM and relation may be out of sync`);
            return;
        }
        applyRelationAttributes(el, String(id), relationName, relationField);
    });
}

function applyRelationAttributes(
    el: HTMLElement,
    owner: string,
    relationName: string,
    relationField: FluxRelationFieldConfig,
): void {
    el.setAttribute('fx-type', 'GridField');
    el.setAttribute('fx-key', relationName);
    el.setAttribute('fx-grid-actions', JSON.stringify(relationField.actions));
    el.setAttribute('fx-owner', owner);

    if (!relationField.Fields) return;

    for (const [fieldName, fieldConfig] of Object.entries(relationField.Fields)) {
        if (!fieldConfig.bind) {
            logger.warn(`Flux: No selector for ${relationName}.${fieldName}`);
            continue;
        }
        const childEl = el.querySelector<HTMLElement>(fieldConfig.bind);
        if (!childEl) {
            logger.warn(`Flux: Cannot find element for ${relationName}.${fieldName} with selector: ${fieldConfig.bind}`);
            continue;
        }
        childEl.setAttribute('fx-key', fieldName);
        childEl.setAttribute('fx-type', fieldConfig.type);
        childEl.setAttribute('fx-owner', owner);
    }
}
