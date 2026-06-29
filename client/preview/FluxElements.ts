import { FluxActionToolbar } from "./overlays/FluxActionToolbar";
import { FluxEditOpenButton } from "./overlays/FluxEditOpenButton";
import { FluxInlineHandle } from "./overlays/FluxInlineHandle";
import { FluxLinkOverlay } from "./overlays/FluxLinkOverlay";
import { FluxUploadOverlay } from "./overlays/FluxUploadOverlay";

export {
    FluxActionToolbar,
    FluxEditOpenButton,
    FluxInlineHandle,
    FluxLinkOverlay,
    FluxUploadOverlay,
};

/**
 * Register every Flux overlay Custom Element exactly once. Safe to call
 * multiple times — `customElements.get(tag)` guards against re-registration
 * (which would otherwise throw).
 */
export function registerFluxElements(): void {
    define("flux-edit-open-btn", FluxEditOpenButton);
    define("flux-action-toolbar", FluxActionToolbar);
    define("flux-upload-overlay", FluxUploadOverlay);
    define("flux-link-overlay", FluxLinkOverlay);
    define("flux-inline-handle", FluxInlineHandle);
}

function define(tag: string, ctor: CustomElementConstructor): void {
    if (customElements.get(tag)) return;
    customElements.define(tag, ctor);
}

declare global {
    interface HTMLElementTagNameMap {
        "flux-edit-open-btn": FluxEditOpenButton;
        "flux-action-toolbar": FluxActionToolbar;
        "flux-upload-overlay": FluxUploadOverlay;
        "flux-link-overlay": FluxLinkOverlay;
        "flux-inline-handle": FluxInlineHandle;
    }
}
