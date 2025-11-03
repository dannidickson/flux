import FrameChannel from "../bind/FrameChannel";
// @ts-ignore - idiomorph doesn't have TypeScript definitions
import Idiomorph from "idiomorph";


// Declare Idiomorph global type
declare global {
    interface Window {
        Idiomorph: {
            morph: (oldNode: Node | HTMLElement, newContent: string | Node, options?: any) => void;
        };
    }
}

// Signal to parent that frame is ready to recieve messages
if (window.parent !== window) {
    window.parent.postMessage({ type: 'FRAME_READY' }, window.location.origin);
}

const frame = new FrameChannel();

frame.onRecievedMessage = (event) => {
    updateElement(event.data);
};

window.addEventListener('DOMContentLoaded', () => {
    if (!window.FluxConfig) return;

    const { Fields } = window.FluxConfig;

    if (Object.keys(Fields).length === 0) return;

    for (const [key, value] of Object.entries(Fields)) {
        addBindingToElement(value);
    }
});

const addBindingToElement = (field: any) => {
    const element = document.querySelector(field.bind);

    if (!element) {
        console.warn(`Flux: Cannot find element for: ${field.key}`, field);
    }

    element?.setAttribute(`fx-key`, field.key);
    element?.setAttribute(`fx-type`, field.type);
}

/**
 * Apply partial patches by finding HTML comment markers and morphing content
 *
 * @param patches - Map of block IDs to patch data
 * @returns number of patches applied
 */
const applyPartialPatches = (patches: Record<string, FluxPatch>): number => {
    let appliedCount = 0;

    for (const [blockId, patch] of Object.entries(patches)) {
        const commentStart = findCommentNode(document.body, `FLUX_START:${blockId}:`);
        const commentEnd = findCommentNode(document.body, `FLUX_END:${blockId}`);

        if (!commentStart || !commentEnd) {
            console.warn(`Flux: Could not find comment markers for ${blockId}`);
            continue;
        }

        const deps = patch.dependencies ? patch.dependencies.join(', ') : 'none';
        console.log(`Flux: Applying patch to ${blockId} (type: ${patch.type}, deps: ${deps})`);

        const nodesToReplace: Node[] = [];
        let currentNode: Node | null = commentStart.nextSibling;

        while (currentNode && currentNode !== commentEnd) {
            nodesToReplace.push(currentNode);
            currentNode = currentNode.nextSibling;
        }

        const tempContainer = document.createElement('div');
        tempContainer.innerHTML = patch.html;

        const fragment = document.createDocumentFragment();
        while (tempContainer.firstChild) {
            fragment.appendChild(tempContainer.firstChild);
        }

        nodesToReplace.forEach(node => {
            if (node.parentNode) {
                node.parentNode.removeChild(node);
            }
        });

        commentStart.parentNode?.insertBefore(fragment, commentEnd);

        appliedCount++;
    }

    return appliedCount;
};

/**
 * Find a comment node by its text content
 */
const findCommentNode = (root: Node, searchText: string): Comment | null => {
    const walker = document.createTreeWalker(
        root,
        NodeFilter.SHOW_COMMENT,
        null
    );

    let node: Node | null;
    while (node = walker.nextNode()) {
        if (node.nodeType === Node.COMMENT_NODE && node.nodeValue?.includes(searchText)) {
            return node as Comment;
        }
    }

    return null;
};

/**
 * Applies the returned HTML to the document
 *
 * Supports both partial patching (when hasPartialSupport is true) and
 * full document morphing (fallback).
 *
 * @TODO
 *  move this into the `core/index`
 *  Allow developer option for the scripts to be reloaded if they want
 *
 * @param fluxBroadCastMessage
 * @returns
 */
const updateElement = (fluxBroadCastMessage: FluxBroadCastMessage) => {
    console.log('Flux message received:', fluxBroadCastMessage);

    // Handle full template updates
    if (fluxBroadCastMessage.type === "templateUpdate") {
        if (!fluxBroadCastMessage.html) {
            console.error('templateUpdate received but no HTML provided');
            return;
        }

        // Try partial patching first if supported
        if (fluxBroadCastMessage.hasPartialSupport &&
            fluxBroadCastMessage.patches &&
            fluxBroadCastMessage.blockCount &&
            fluxBroadCastMessage.blockCount > 0) {

            console.log(`Flux: Applying ${fluxBroadCastMessage.blockCount} partial patches...`);
            console.time('partial-patch');

            const appliedCount = applyPartialPatches(fluxBroadCastMessage.patches);

            console.log(`Flux: Successfully applied ${appliedCount}/${fluxBroadCastMessage.blockCount} patches`);
            console.timeEnd('partial-patch');
            return;
        }

        // Fallback to full document morphing
        console.log('Flux: Morphing entire document (no partial support)...');
        console.time('full-morph');

        // Parse the HTML to remove doctype and extract just the <html> element
        const parser = new DOMParser();
        const newDoc = parser.parseFromString(fluxBroadCastMessage.html, 'text/html');

        // Use Idiomorph to morph the entire document
        Idiomorph.morph(document.documentElement, newDoc.documentElement, {
            head: {
                style: 'morph'  // Morph style tags in the head
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

        console.log('Document morphed successfully');
        console.timeEnd('full-morph');
        return;
    }

    // Handle individual field updates (textUpdate)
    if (fluxBroadCastMessage.type === "textUpdate" && fluxBroadCastMessage.key) {
        const element = document.querySelector(`[fx-key="${fluxBroadCastMessage.key}"]`);

        if (!element) {
            console.warn(`Element with fx-key="${fluxBroadCastMessage.key}" not found`);
            return;
        }

        if (fluxBroadCastMessage.value !== undefined) {
            element.innerHTML = fluxBroadCastMessage.value;
            console.log(`Updated element [fx-key="${fluxBroadCastMessage.key}"]`);
        }
        return;
    }

    console.warn('Unknown message type or missing data:', fluxBroadCastMessage);
}
