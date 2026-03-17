import FrameChannel from "../channels/FrameChannel";
// @ts-ignore
import Idiomorph from "idiomorph";
import { logger } from "../core/logger";
import type { FluxBroadCastMessage, FluxConfigStructure } from "../types/flux.interface";
import { applyConfig } from "../core/FluxDirectives";

declare global {
    interface Window {
        Idiomorph: {
            morph: (oldNode: Node | HTMLElement, newContent: string | Node, options?: any) => void;
        };
        FluxConfig?: FluxConfigStructure;
    }
}

const beforeNodeMorphed = (oldNode: any) => oldNode.tagName !== 'SCRIPT';

const frame = new FrameChannel();

frame.onRecievedMessage = (event) => {
    const messageType = event.data.type;

    if (messageType === 'configUpdate') {
        window.FluxConfig = event.data.config;
        logger.log('FluxConfig received from host:', window.FluxConfig);

        applyConfig(window.FluxConfig!);
        return;
    }

    updateElement(event.data);
};

window.addEventListener('DOMContentLoaded', () => {
    if (window.FluxConfig) {
        applyConfig(window.FluxConfig);
    }
});

/**
 * Applies the returned HTML to the document
 *
 * @TODO
 *  move this into the `core/index`
 *  Allow developer option for the scripts to be reloaded if they want
 */
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

        Idiomorph.morph(document.documentElement, newDoc.documentElement, {
            head: { style: 'morph' },
            callbacks: { beforeNodeMorphed },
        });

        logger.log('Document morphed successfully');
        logger.timeEnd('morph');

        applyConfig(window.FluxConfig!);
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
        return;
    }

    if (fluxBroadCastMessage.type === "textUpdate" && fluxBroadCastMessage.key) {
        logger.log(fluxBroadCastMessage);

        const parts = fluxBroadCastMessage.owner
            ? [`${fluxBroadCastMessage.owner}`, `[fx-key="${fluxBroadCastMessage.key}"]`]
            : [`[fx-key="${fluxBroadCastMessage.key}"]`];

        const element = document.querySelector(parts.join(' '));

        if (!element) {
            logger.warn(`Element with fx-key="${fluxBroadCastMessage.key}" not found`);
            return;
        }

        // @ts-ignore
        element.innerHTML = fluxBroadCastMessage.value;
        logger.log(`Updated element [fx-key="${fluxBroadCastMessage.key}"]`);
        return;
    }

    logger.warn('Unknown message type or missing data:', fluxBroadCastMessage);
}
