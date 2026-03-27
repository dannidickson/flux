import { FluxEditButton } from "./FluxEditButton";
import { FluxGridToolbar } from "./FluxGridToolbar";
import { FluxLinkDot } from "./FluxLinkDot";

export { FluxEditButton, FluxGridToolbar, FluxLinkDot };

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
}

declare global {
    interface HTMLElementTagNameMap {
        "flux-edit-btn": FluxEditButton;
        "flux-grid-toolbar": FluxGridToolbar;
        "flux-link-dot": FluxLinkDot;
    }
}
