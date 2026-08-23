/**
 * Flux's fx-* attributes are set on the PHP FormField and travel to the client
 * inside silverstripe/admin's form schema, in each field's `attributes` map.
 * Whether they reach the DOM is up to the React component that renders the
 * field: TextField spreads them, but CheckboxField (and anything else that
 * builds its own <input>) drops them, so those fields never match `[fx-key]`
 * and never get bound.
 *
 * Stamping the attributes back on afterwards does not hold either — React
 * replaces the input node on every change, taking listeners with it.
 *
 * The schema those components were rendered from still carries the bindings,
 * so we read them from there and bind by delegation instead.
 */
import { logger } from '../../core/logger';

interface SchemaField {
    name?: string;
    attributes?: Record<string, string>;
    children?: SchemaField[];
}

function formSchemas(): Record<string, { schema?: { fields?: SchemaField[] } }> | null {
    const store = (window as { ss?: { store?: { getState?: () => any } } }).ss?.store;
    if (typeof store?.getState !== 'function') {
        return null;
    }
    return store.getState()?.form?.formSchemas ?? null;
}

function findField(fields: SchemaField[] | undefined, name: string): SchemaField | null {
    for (const field of fields ?? []) {
        if (field.name === name) {
            return field;
        }
        const child = findField(field.children, name);
        if (child) {
            return child;
        }
    }
    return null;
}

/**
 * The fx-* attributes the server set for a form field, by its input name, or
 * null when the field is not a Flux field (or no React form is on the page).
 */
export function fluxAttributesForField(name: string): Record<string, string> | null {
    const schemas = formSchemas();
    if (!schemas) {
        return null;
    }

    for (const entry of Object.values(schemas)) {
        const attributes = findField(entry?.schema?.fields, name)?.attributes;
        if (attributes?.['fx-key']) {
            return attributes;
        }
    }

    return null;
}

const reported = new Set<string>();

/**
 * Say so — once per field — when a binding had to come from the schema. It
 * means that field's React component dropped the attributes, and every
 * fx-* consumer that reads the DOM (the preview annotator, inline editing) cannot see it.
 */
export function reportSchemaFallback(name: string, key: string): void {
    if (reported.has(name)) {
        return;
    }
    reported.add(name);
    logger.warn(
        `Flux: "${key}" (${name}) carries no fx-* attributes in the DOM — its React field dropped them. ` +
            'Bound from the form schema instead.',
    );
}
