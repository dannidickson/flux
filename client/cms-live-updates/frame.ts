import FrameChannel from "../bind/FrameChannel";
// @ts-ignore
import Idiomorph from "idiomorph";
import { logger } from "../core/logger";

declare global {
    interface Window {
        Idiomorph: {
            morph: (oldNode: Node | HTMLElement, newContent: string | Node, options?: any) => void;
        };
        FluxConfig?: {
            Segments: Array<{
                Type: 'Page' | 'Element';
                ID: string | number;
                ClassName: string;
                owner?: string;
            }>;
            ChangeSet: Record<string, Record<string, any>>;
            Events: any[];
        };
    }
}

const frame = new FrameChannel();

frame.onRecievedMessage = (event) => {
    const messageType = event.data.type;

    if (messageType === 'configUpdate') {
        window.FluxConfig = event.data.config;
        logger.log('FluxConfig received from host:', window.FluxConfig);

        addBindingsToSegments();
        return;
    }

    updateElement(event.data);
};

window.addEventListener('DOMContentLoaded', () => {
    if (window.FluxConfig) {
        addBindingsToSegments();
    }
});

/**
 * Adds the Config bindings to each element
 * Iterates through flat Segments array and looks up ChangeSet by ClassName
 */
const addBindingsToSegments = () => {
    if (!window.FluxConfig) return;

    const { Segments, ChangeSet } = window.FluxConfig;

    if (!Segments || !ChangeSet) return;

    logger.log('Segments:', Segments);
    logger.log('ChangeSet:', ChangeSet);

    // Loop through flat segments array
    for (const segment of Segments) {
        // Look up fields for this segment by ClassName
        const segmentFields = ChangeSet[segment.ClassName];

        if (!segmentFields) {
            logger.log(`No fields found for ${segment.ClassName}`);
            continue;
        }

        // Apply bindings for each field in this segment
        for (const [fieldKey, fieldValue] of Object.entries(segmentFields)) {
            addBindingToElement(fieldValue, segment);
        }
    }
}

const addBindingToElement = (field: any, segment: any) => {
    // Build scoped query selector
    const querySelectorParts = [];

    if (segment.owner) {
        querySelectorParts.push(`${segment.owner}`);
    }

    querySelectorParts.push(field.bind);

    const querySelectorPath = querySelectorParts.join(' ');
    const element = document.querySelector(querySelectorPath);

    if (!element) {
        logger.warn(`Flux: Cannot find element for: ${field.key} with selector: ${querySelectorPath}`);
        return;
    }

    element.setAttribute(`fx-key`, field.key);
    element.setAttribute(`fx-type`, field.type);

    if (segment.owner) {
        element.setAttribute(`fx-owner`, segment.owner);
    }
}

/**
 * Applies the returned HTML to the document
 *
 * @TODO
 *  move this into the `core/index`
 *  Allow developer option for the scripts to be reloaded if they want
 *
 * @param fluxBroadCastMessage
 * @returns
 */
const updateElement = (fluxBroadCastMessage: FluxBroadCastMessage) => {
    logger.log('Flux message received:', fluxBroadCastMessage);
    // Handle full template updates
    if (fluxBroadCastMessage.type === "pageTemplateUpdate") {
        if (!fluxBroadCastMessage.html) {
            logger.error('pageTemplateUpdate received but no HTML provided');
            return;
        }

        logger.log('Morphing document with new HTML...');
        logger.time('morph');

        // Parse the HTML to remove doctype and extract just the <html> element
        const parser = new DOMParser();
        const newDoc = parser.parseFromString(fluxBroadCastMessage.html, 'text/html');

        // Use Idiomorph to morph the entire document
        Idiomorph.morph(document.documentElement, newDoc.documentElement, {
            head: {
                style: 'morph'
            },
            callbacks: {
                beforeNodeMorphed: (oldNode: any, newNode: any) => {
                    // Skip morphing script tags to avoid re-execution
                    if (oldNode.tagName === 'SCRIPT') {
                        return false;
                    }
                    return true;
                }
            }
        });

        logger.log('Document morphed successfully');
        logger.timeEnd('morph');

        addBindingsToSegments();
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
            callbacks: {
                beforeNodeMorphed: (oldNode: any, newNode: any) => {
                    if (oldNode.tagName === 'SCRIPT') {
                        return false;
                    }
                    return true;
                }
            }
        });

        logger.log('Block morphed successfully');
        logger.timeEnd('blockMorph');

        addBindingsToSegments();
        return;
    }

    // Handle individual field updates (textUpdate)
    if (fluxBroadCastMessage.type === "textUpdate" && fluxBroadCastMessage.key) {
        logger.log(fluxBroadCastMessage);

        const querySelectorParts = [];

        if (fluxBroadCastMessage.owner) {
            querySelectorParts.push(`${fluxBroadCastMessage.owner}`);
        }

        querySelectorParts.push(`[fx-key="${fluxBroadCastMessage.key}"]`);

        const querySelectorPath = querySelectorParts.join(' ');

        logger.log(querySelectorPath);

        const element = document.querySelector(querySelectorPath);

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
