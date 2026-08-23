/**
 * Bridges the v2 `window.FluxBootstrap` payload into the v1 `window.FluxConfig`
 * shape that FluxLiveState / FluxDirectiveManager already consume.
 *
 * @todo need to merge in the various states from config to livestate into a single var
 */

import { logger } from "../core/logger";
import type {
    FluxConfigSegment,
    FluxConfigStructure,
} from "../types/flux.interface";

export interface FluxScope {
    kind: "page" | "block" | "relation-item";
    ownerId: string | null;
}

export interface FluxContextPayload {
    scope: FluxScope;
    page: { id: number; class: string } | null;
    segments: FluxConfigSegment[];
    schema: Record<string, { Fields: Record<string, any>; RelationFields: Record<string, any> }>;
}

export interface FluxContextHint {
    class: string;
    id: number;
    itemID?: number | null;
    relation?: string | null;
}

export interface FluxBootstrapPayload {
    context?: FluxContextPayload;
    contextHint?: FluxContextHint | null;
    contextUrl?: string;
    pageClass?: string;
    pageId?: number;
    csrf?: string;
    inlineEditorEnabled?: boolean;
}

declare global {
    interface Window {
        FluxBootstrap?: FluxBootstrapPayload;
        /** Full page-scoped context inlined into the preview frame by FluxExtension (v1-style). */
        FluxFrameContext?: FluxContextPayload;
        FluxScope?: FluxScope;
        FluxCsrf?: string;
        FluxContextHint?: FluxContextHint | null;
        FluxInlineEditorEnabled?: boolean;
    }
}

/**
 * Convert a v2 context payload into the legacy FluxConfig shape.
 *
 * Preserves in-flight ChangeSet only when the same record is still being
 * edited (same page id + class). Switching records resets ChangeSet so we
 * don't misapply edits from page A onto a different record that happens to
 * share a class name.
 */
export function adaptContextToFluxConfig(context: FluxContextPayload): FluxConfigStructure {
    const fields: Record<string, Record<string, any>> = {};
    const relationFields: Record<string, Record<string, any>> = {};

    for (const [className, slice] of Object.entries(context.schema)) {
        fields[className] = slice.Fields ?? {};
        relationFields[className] = slice.RelationFields ?? {};
    }

    const previous = window.FluxConfig;
    const previousPage = previous?.Segments?.find((s) => s.Type === "Page");
    const nextPage = context.segments.find((s) => s.Type === "Page");

    const sameRecord =
        !!previousPage &&
        !!nextPage &&
        String(previousPage.ID) === String(nextPage.ID) &&
        previousPage.ClassName === nextPage.ClassName;

    let changeSet: Record<string, Record<string, any>> = {};
    if (sameRecord) {
        changeSet = previous?.ChangeSet ?? {};
    } else if (previous?.ChangeSet && Object.keys(previous.ChangeSet).length > 0) {
        logger.error(
            "Discarding pending changes: context switched records",
            {
                from: previousPage ? `${previousPage.ClassName}#${previousPage.ID}` : null,
                to: nextPage ? `${nextPage.ClassName}#${nextPage.ID}` : null,
                discarded: Object.keys(previous.ChangeSet),
            },
        );
    }

    return {
        Segments: context.segments,
        Fields: fields,
        RelationFields: relationFields,
        ChangeSet: changeSet as Record<string, Record<string, any>>,
        Events: [],
    };
}

export function applyContext(context: FluxContextPayload): void {
    window.FluxConfig = adaptContextToFluxConfig(context);
    window.FluxScope = context.scope;
    logger.log("Applied Flux context:", context.scope);
}

/**
 * Read the most-specific FluxBootstrap script tag in the document.
 * When nested items are edited, both LeftAndMain and GridFieldDetailForm add a
 * `<script id="flux-bootstrap-data">` — the inner one (later in DOM order) takes precedence.
 */
function readBootstrapScriptTag(): FluxBootstrapPayload | null {
    const nodes = document.querySelectorAll<HTMLScriptElement>('script#flux-bootstrap-data');
    if (nodes.length === 0) return null;

    // Walk in reverse so the deepest (innermost form) wins.
    for (let i = nodes.length - 1; i >= 0; i--) {
        const txt = nodes[i].textContent;
        if (!txt) continue;
        try {
            return JSON.parse(txt) as FluxBootstrapPayload;
        } catch {
            // try the next one
        }
    }
    return null;
}

/**
 * Host entry: read the inline bootstrap injected by the LeftAndMain or
 * GridFieldDetailForm extension. Returns the FluxConfig that was set,
 * or null if no context was present.
 */
function applyBootstrapPayload(payload: FluxBootstrapPayload): void {
    if (payload.csrf) window.FluxCsrf = payload.csrf;
    if (payload.contextHint !== undefined) window.FluxContextHint = payload.contextHint;
    if (payload.inlineEditorEnabled !== undefined) window.FluxInlineEditorEnabled = payload.inlineEditorEnabled;
    applyContext(payload.context!);
}

export function applyInlineHostBootstrap(): FluxConfigStructure | null {
    const bootstrap = readBootstrapScriptTag() ?? window.FluxBootstrap ?? null;
    if (!bootstrap?.context) return null;
    applyBootstrapPayload(bootstrap);
    return window.FluxConfig ?? null;
}

/** Most-recent hint captured from a host-side bootstrap, for the host to ship to the frame. */
export function currentContextHint(): FluxContextHint | null {
    return window.FluxContextHint ?? null;
}

/**
 * Host PJAX hook: read the FluxBootstrap from the most-specific
 * #flux-bootstrap-data <script> tag in the swapped form HTML. Standard CMS PJAX
 * requests only fetch CurrentForm/Content/Breadcrumbs, so the bootstrap is included inside the form HTML.
 */
export function applyPjaxBootstrapFromDom(): boolean {
    const payload = readBootstrapScriptTag();
    if (!payload?.context) return false;
    applyBootstrapPayload(payload);
    return true;
}

/**
 * Preview-frame entry: fetch /flux/context with the params handed in by
 * the host (via the contextHint MessageChannel message). The frame can't
 * know which record/item is being edited on its own — only the CMS does.
 *
 * Resolves to the FluxConfig once applied.
 */
export async function fetchFluxContext(hint: FluxContextHint): Promise<FluxConfigStructure | null> {
    const context = await fetchContextPayload(hint);
    if (!context) return null;
    applyContext(context);
    return window.FluxConfig ?? null;
}

/**
 * Fetch the context payload without applying it. Lets callers decide whether
 * to apply — the frame's boot fetch must not overwrite a more-specific scope the
 * host may have sent while the fetch was still running.
 */
export async function fetchContextPayload(hint: FluxContextHint): Promise<FluxContextPayload | null> {
    const params = new URLSearchParams();
    params.set("class", hint.class);
    params.set("id", String(hint.id));
    if (hint.itemID) params.set("itemID", String(hint.itemID));
    if (hint.relation) params.set("relation", hint.relation);

    try {
        const response = await fetch(`/flux/context?${params.toString()}`, {
            credentials: "same-origin",
            headers: { Accept: "application/json" },
        });
        if (!response.ok) {
            logger.warn("Flux context fetch failed:", response.status);
            return null;
        }
        return (await response.json()) as FluxContextPayload;
    } catch (error) {
        logger.warn("Flux context fetch error:", error);
        return null;
    }
}
