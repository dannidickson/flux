import { FluxEditButton } from "./FluxEditButton";
import { FluxGridToolbar } from "./FluxGridToolbar";
import { FluxLinkDot } from "./FluxLinkDot";
import { FluxUploadToolbar } from "./FluxUploadToolbar";

export { FluxEditButton, FluxGridToolbar, FluxLinkDot, FluxUploadToolbar };

export function registerFluxElements(): void {
    if (!customElements.get("flux-edit-btn")) {
        customElements.define("flux-edit-btn", FluxEditButton);
    }

    if (!customElements.get("flux-grid-toolbar")) {
        customElements.define("flux-grid-toolbar", FluxGridToolbar);
    }

    if (!customElements.get("flux-link-dot")) {
        customElements.define("flux-link-dot", FluxLinkDot);
    }

    if (!customElements.get("flux-upload-toolbar")) {
        customElements.define("flux-upload-toolbar", FluxUploadToolbar);
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "flux-edit-btn": FluxEditButton;
        "flux-grid-toolbar": FluxGridToolbar;
        "flux-link-dot": FluxLinkDot;
        "flux-upload-toolbar": FluxUploadToolbar;
    }
}
