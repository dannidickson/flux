import FrameChannel from "../channels/FrameChannel";
// @ts-expect-error -- idiomorph ships no type declarations
import Idiomorph from "idiomorph";
import { logger } from "../core/logger";
import type {
    BlockUpdateMessage,
    HostToFrameMessage,
    PageTemplateUpdateMessage,
    PatchTemplateUpdateMessage,
    RichTextPatchMessage,
    RichTextUpdateMessage,
    TextUpdateMessage,
} from "../types/flux.interface";
import { applyConfig } from "./directives/FluxDirectives";
import { applyContext, fetchFluxContext } from "./FluxBootstrap";

declare global {
    interface Window {
        FluxMode?: import("../types/flux.interface").FluxCmsMode;
    }
}

interface IdimorphOptions {
    head?: { style?: string };
    callbacks?: {
        beforeNodeMorphed?: (oldNode: Element) => boolean;
    };
}

declare global {
    interface Window {
        Idiomorph: {
            morph: (oldNode: Node | HTMLElement, newContent: string | Node, options?: IdimorphOptions) => void;
        };
    }
}

const beforeNodeMorphed = (oldNode: Element): boolean => oldNode.tagName !== 'SCRIPT';

type KeyedMessage = { key: string; owner: string | null };

function fxSelector(msg: KeyedMessage): string {
    if (msg.owner) {
        return `[fx-owner="${msg.owner}"][fx-key="${msg.key}"]`;
    }
    return `[fx-key="${msg.key}"]:not([fx-owner])`;
}

const frame = new FrameChannel();

type HandlerMap = {
    [K in HostToFrameMessage['type']]?: (msg: Extract<HostToFrameMessage, { type: K }>) => void;
};

// we re-apply the fx-* directives after morphing the DOM
function afterMorph(): void {
    if (!window.FluxConfig) {
        logger.warn("afterMorph: no FluxConfig yet — fx-* not re-applied.");
        return;
    }
    applyConfig(window.FluxConfig);
}

/**
 * Find all fx-key elements for the message. Warns if none are found and
 * skips updates that would overwrite a field the user is actively editing.
 */
function findFxTargets(msg: KeyedMessage, kind: string): Element[] {
    const selector = fxSelector(msg);
    const elements = Array.from(document.querySelectorAll(selector));

    if (!elements.length) {
        logger.warn(`[findFxDirective] ${kind} DROPPED: no element matched ${selector}`, msg);
        return [];
    }

    return elements;
}

function handlePageTemplateUpdate(msg: PageTemplateUpdateMessage): void {
    logger.log('Morphing document with new HTML...');
    logger.time('morph');

    const newDoc = new DOMParser().parseFromString(msg.html, 'text/html');
    Idiomorph.morph(document.documentElement, newDoc.documentElement, { head: { style: 'morph' }, callbacks: { beforeNodeMorphed } });

    logger.log('[morphing] Document morphed successfully');
    logger.timeEnd('morph');

    afterMorph();
}

function handleBlockUpdate(msg: BlockUpdateMessage): void {
    const ownerElement = document.querySelector(msg.targetOwner);
    if (!ownerElement) {
        logger.error(
            `Block owner element not found: ${msg.targetOwner} — block showing previous content`,
        );
        return;
    }

    logger.log(`Morphing block: ${msg.targetOwner}`);
    logger.time('blockMorph');

    Idiomorph.morph(ownerElement, msg.html, {
        morphStyle: 'innerHTML',
        callbacks: { beforeNodeMorphed },
    });

    logger.log('Block morphed successfully');
    logger.timeEnd('blockMorph');

    afterMorph();
}

function handlePatchTemplateUpdate(msg: PatchTemplateUpdateMessage): void {
    const selector = fxSelector(msg);
    const elements = document.querySelectorAll(selector);
    if (!elements.length) {
        logger.warn(`[patchTemplateUpdate]: element not found for ${selector}`);
        return;
    }

    elements.forEach((element) => {
        element.innerHTML = msg.value;
    });

    logger.log(`[patchTemplateUpdate] Patched element ${selector}`);
}

function handleRichTextUpdate(msg: RichTextUpdateMessage | RichTextPatchMessage): void {
    const elements = findFxTargets(msg, msg.type);
    if (!elements.length) return;

    elements.forEach((element) => {
        Idiomorph.morph(element, msg.value, {
            morphStyle: 'innerHTML',
            callbacks: { beforeNodeMorphed },
        });
    });

    logger.log(`Morphed ${msg.type} [fx-key="${msg.key}"]`);
}

function handleTextUpdate(msg: TextUpdateMessage): void {
    logger.log(`[textUpdate] frame received: key="${msg.key}" owner="${msg.owner}" selector="${fxSelector(msg)}"`);

    const elements = findFxTargets(msg, 'textUpdate');
    if (!elements.length) return;

    elements.forEach((element) => {
        element.textContent = msg.value;
    });
    logger.log(`[textUpdate] frame applied to [fx-key="${msg.key}"]`);
}

const handlers: HandlerMap = {
    pageTemplateUpdate: handlePageTemplateUpdate,
    blockUpdate: handleBlockUpdate,
    patchTemplateUpdate: handlePatchTemplateUpdate,
    richTextUpdate: handleRichTextUpdate,
    richTextPatch: handleRichTextUpdate,
    textUpdate: handleTextUpdate,
};

function updateElement(msg: HostToFrameMessage): void {
    logger.log('Flux message received:', msg);

    const handler = handlers[msg.type] as ((m: HostToFrameMessage) => void) | undefined;
    if (!handler) {
        logger.warn('Unknown message type or missing data:', msg);
        return;
    }

    handler(msg);
}

// The host's pushes carry the authoritative scope (it knows whether a block or
// relation item is being edited). Once one lands, the frame's own boot fetch
// (page-scoped, see bootstrapFrameContext) must not clobber it.
let hostContextApplied = false;

frame.onReceivedMessage = async (event) => {
    if (event.data.type === 'contextHint') {
        // Host telling us which slice of /flux/context to load. Fetch + apply.
        logger.log('contextHint from host:', event.data);
        hostContextApplied = true;
        await fetchFluxContext(event.data);
        if (window.FluxConfig) {
            applyConfig(window.FluxConfig);
        }
        return;
    }

    if (event.data.type === 'configUpdate') {
        // Direct push from host (used when we already have a config in hand
        // and want to skip the extra round-trip — chunked save flow, etc.).
        hostContextApplied = true;
        window.FluxConfig = event.data.config;
        logger.log('FluxConfig pushed from host:', window.FluxConfig);
        applyConfig(window.FluxConfig!);
        return;
    }

    if (event.data.type === 'modeChange') {
        window.FluxMode = event.data.mode;
        logger.log('CMS mode:', event.data.mode);
        return;
    }

    updateElement(event.data);
};

function bootstrapFrameContext(): void {
    const context = window.FluxFrameContext;
    if (!context) return;

    if (hostContextApplied) {
        logger.log('Inline frame context present, but host scope already applied — keeping host scope.');
        return;
    }

    applyContext(context);
    if (window.FluxConfig) {
        applyConfig(window.FluxConfig);
    }
}

if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', bootstrapFrameContext, { once: true });
} else {
    bootstrapFrameContext();
}
