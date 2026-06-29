/**
 * Shared base for Flux preview-overlay Custom Elements.
 *
 *  - ShadowDOM root with adoptedStyleSheets pipeline
 *  - attach(target) / detach() / position() / show() / hide() lifecycle
 *  - emit(): typed FrameToHostMessage dispatch on a "flux-overlay-message"
 *    CustomEvent that InlineEditor forwards onto the host channel
 *
 * Overlays are appended to `document.body` (not the target's subtree) so
 * they aren't clipped by overflow:hidden ancestors. `position(rect)` is
 * called when the controller decides to show.
 */

import type { FrameToHostMessage } from "../types/flux.interface";

export abstract class FluxOverlayElement extends HTMLElement {
    protected shadow: ShadowRoot;
    protected target: HTMLElement | null = null;

    constructor(stylesheet: CSSStyleSheet) {
        super();
        this.shadow = this.attachShadow({ mode: "open" });
        this.shadow.adoptedStyleSheets = [stylesheet];
    }

    attach(target: HTMLElement): void {
        this.target = target;
        if (!this.isConnected) document.body.appendChild(this);
        this.hide();
    }

    detach(): void {
        this.hide();
        this.target = null;
        if (this.isConnected) this.remove();
    }

    /**
     * Position the overlay relative to the target's current bounding rect.
     * Default puts it at the top-right corner; subclasses override as needed.
     */
    position(rect?: DOMRect): void {
        const r = rect ?? this.target?.getBoundingClientRect();
        if (!r) return;
        this.style.position = "fixed";
        this.style.top = `${r.top}px`;
        this.style.left = `${r.right}px`;
    }

    show(): void {
        if (!this.target) return;
        this.position();
        this.setAttribute("visible", "");
    }

    hide(): void {
        this.removeAttribute("visible");
    }

    /**
     * Emit a typed message to the host channel via a bubbling CustomEvent that
     * InlineEditor (the orchestrator) forwards onto the MessageChannel.
     */
    protected emit(message: FrameToHostMessage): void {
        this.dispatchEvent(
            new CustomEvent("flux-overlay-message", {
                bubbles: true,
                composed: true,
                detail: message,
            }),
        );
    }
}
