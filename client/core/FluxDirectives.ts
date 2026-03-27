import { fromElement, type FluxDirective } from './FluxDirective';
import type { FluxConfigStructure } from '../types/flux.interface';
import { logger } from './logger';

/**
 * Parse all [fx-key] elements in a container into FxDirective instances.
 */
export function parse(root: HTMLElement | Document = document): FluxDirective[] {
    return Array.from(root.querySelectorAll('[fx-key]'))
        .map((el) => fromElement(el as HTMLElement))
        .filter((d): d is FluxDirective => d !== null);
}

/**
 * Apply fx-* attributes from FluxConfig to DOM elements.
 * Called by frame.ts after a morph to re-attach directives.
 */
export function applyConfig(config: FluxConfigStructure): void {
    const { Segments, Fields } = config;
    if (!Segments || !Fields) return;

    for (const segment of Segments) {
        const segmentFields = Fields[segment.ClassName];

        if (!segmentFields) {
            logger.log(`No fields found for ${segment.ClassName}`);
            continue;
        }

        for (const [, field] of Object.entries(segmentFields)) {
            const parts = segment.owner ? [segment.owner, field.bind] : [field.bind];
            const element = document.querySelector(parts.join(' '));

            if (!element) {
                logger.warn(`Flux: Cannot find element for: ${field.key} with selector: ${parts.join(' ')}`);
                continue;
            }

            element.setAttribute('fx-key', field.key);
            element.setAttribute('fx-type', field.type);
            if (segment.owner) element.setAttribute('fx-owner', segment.owner);
        }

        const { RelationFields } = config;
        if (!RelationFields) continue;

        const segmentRelationFields = RelationFields[segment.ClassName];
        if (!segmentRelationFields) continue;

        for (const [relationName, relationField] of Object.entries(segmentRelationFields)) {
            if (!relationField.selector) {
                logger.warn(`Flux: RelationField ${relationName} is missing a selector`);
                continue;
            }

            const els = Array.from(document.querySelectorAll<HTMLElement>(relationField.selector));

            els.forEach((el, index) => {
                const id = relationField.ids?.[index];
                if (id === undefined) {
                    logger.warn(`Flux: no record ID for ${relationName}[${index}] — DOM and relation may be out of sync`);
                    return;
                }

                const owner = String(id);

                el.setAttribute('fx-type', 'GridField');
                el.setAttribute('fx-key', relationName);
                el.setAttribute('fx-grid-actions', JSON.stringify(relationField.actions));
                el.setAttribute('fx-owner', owner);

                if (relationField.Fields) {
                    for (const [fieldName, fieldConfig] of Object.entries(relationField.Fields)) {
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
            });
        }
    }
}
