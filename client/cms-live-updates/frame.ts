import FrameChannel from "../channels/FrameChannel";
// @ts-ignore
import Idiomorph from "idiomorph";
import { logger } from "../core/logger";
import type { FluxBroadCastMessage, FluxConfigStructure } from "../types/flux.interface";
import { applyConfig } from "../core/FluxDirectives";
import { initInlineEditing, activeEditingFields } from "../preview/InlineEditor";

declare global {
    interface Window {
        Idiomorph: {
            morph: (oldNode: Node | HTMLElement, newContent: string | Node, options?: any) => void;
        };
        FluxConfig?: FluxConfigStructure;
    }
}

const beforeNodeMorphed = (oldNode: any) => oldNode.tagName !== 'SCRIPT';

function fxSelector(msg: FluxBroadCastMessage): string {
    if (msg.owner) {
        return `[fx-owner="${msg.owner}"][fx-key="${msg.key}"]`;
    }
    return `[fx-key="${msg.key}"]`;
}

function isActivelyEditing(msg: FluxBroadCastMessage): boolean {
    const editingId = `${msg.key}|${msg.owner ?? ''}`;
    return activeEditingFields.has(editingId);
}

const frame = new FrameChannel();

frame.onRecievedMessage = (event) => {
    const messageType = event.data.type;

    if (messageType === 'configUpdate') {
        window.FluxConfig = event.data.config;
        logger.log('FluxConfig received from host:', window.FluxConfig);

        applyConfig(window.FluxConfig!);
        initInlineEditing(frame.channel);
        return;
    }

    updateElement(event.data);
};

window.addEventListener('DOMContentLoaded', () => {
    if (window.FluxConfig) {
        applyConfig(window.FluxConfig);
        initInlineEditing(frame.channel);
    }
});

const updateElement = (fluxBroadCastMessage: FluxBroadCastMessage) => {
    logger.log('Flux message received:', fluxBroadCastMessage);

    if (fluxBroadCastMessage.type === "pageTemplateUpdate") {
        if (!fluxBroadCastMessage.html) {
            logger.error('pageTemplateUpdate received but no HTML provided');
            return;
        }

        logger.log('Morphing document with new HTML...');
        logger.time('morph');

        const parser = new DOMParser();
        const newDoc = parser.parseFromString(fluxBroadCastMessage.html, 'text/html');

        Idiomorph.morph(document.body, newDoc.body, {
            callbacks: { beforeNodeMorphed },
        });

        logger.log('Document morphed successfully');
        logger.timeEnd('morph');

        applyConfig(window.FluxConfig!);
        initInlineEditing(frame.channel);
        return;
    }

    if (fluxBroadCastMessage.type === "blockUpdate") {
        if (!fluxBroadCastMessage.html || !fluxBroadCastMessage.targetOwner) {
            logger.error('blockUpdate received but missing html or targetOwner');
            return;
        }

        const ownerElement = document.querySelector(fluxBroadCastMessage.targetOwner);

        if (!ownerElement) {
            logger.warn(`Block owner element not found: ${fluxBroadCastMessage.targetOwner}`);
            return;
        }

        logger.log(`Morphing block: ${fluxBroadCastMessage.targetOwner}`);
        logger.time('blockMorph');

        Idiomorph.morph(ownerElement, fluxBroadCastMessage.html, {
            morphStyle: 'innerHTML',
            callbacks: { beforeNodeMorphed },
        });

        logger.log('Block morphed successfully');
        logger.timeEnd('blockMorph');

        applyConfig(window.FluxConfig!);
        initInlineEditing(frame.channel);
        return;
    }

    if (fluxBroadCastMessage.type === "patchTemplateUpdate" && fluxBroadCastMessage.key) {
        const selector = fxSelector(fluxBroadCastMessage);
        const element = document.querySelector(selector);

        if (!element) {
            logger.warn(`patchTemplateUpdate: element not found for ${selector}`);
            return;
        }

        element.innerHTML = fluxBroadCastMessage.value || ' ';
        logger.log(`Patched element ${selector}`);
        return;
    }

    if ((fluxBroadCastMessage.type === "richTextUpdate" || fluxBroadCastMessage.type === "richTextPatch") && fluxBroadCastMessage.key) {
        const selector = fxSelector(fluxBroadCastMessage);
        const element = document.querySelector(selector);

        if (!element) {
            logger.warn(`${fluxBroadCastMessage.type}: element not found for ${selector}`);
            return;
        }

        if (isActivelyEditing(fluxBroadCastMessage)) {
            logger.log(`Skipping ${fluxBroadCastMessage.type} for active inline edit [fx-key="${fluxBroadCastMessage.key}"]`);
            return;
        }

        Idiomorph.morph(element, fluxBroadCastMessage.value || ' ', {
            morphStyle: 'innerHTML',
            callbacks: { beforeNodeMorphed },
        });

        logger.log(`Morphed ${fluxBroadCastMessage.type} [fx-key="${fluxBroadCastMessage.key}"]`);
        return;
    }

    if (fluxBroadCastMessage.type === "textUpdate" && fluxBroadCastMessage.key) {
        const selector = fxSelector(fluxBroadCastMessage);
        const element = document.querySelector(selector);

        if (!element) {
            logger.warn(`textUpdate: element not found for ${selector}`);
            return;
        }

        if (isActivelyEditing(fluxBroadCastMessage)) {
            logger.log(`Skipping textUpdate for active inline edit [fx-key="${fluxBroadCastMessage.key}"]`);
            return;
        }

        element.innerHTML = fluxBroadCastMessage.value || ' ';
        logger.log(`Updated element [fx-key="${fluxBroadCastMessage.key}"]`);
        return;
    }

    logger.warn('Unknown message type or missing data:', fluxBroadCastMessage);
}
