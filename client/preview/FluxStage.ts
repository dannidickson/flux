/**
 * "Stage" mode — when a block is open for editing, dim the rest of the
 * page so the open block reads as the active surface.
 *
 *  - Renders a single backdrop element behind the open block.
 *  - Sets `data-flux-stage` on <body> so themes can react.
 *  - Closes the open block on backdrop click, click-outside, or Esc.
 *
 * The open block itself is raised above the backdrop via the
 * `[data-flux-editing]` selector in preview.scss.
 */

import { logger } from "../core/logger";
import { blockState } from "./FluxBlockState";

const BACKDROP_ID = "flux-stage-backdrop";
const STAGE_BODY_ATTR = "data-flux-stage";

class FluxStage {
    private backdrop: HTMLElement | null = null;
    private installed = false;

    install(): void {
        if (this.installed) return;
        this.installed = true;

        blockState.subscribe((event) => {
            if (event.open) this.show();
            else if (!blockState.activeOwner()) this.hide();
        });

        document.addEventListener("pointerdown", this.onPointerDown, { capture: true });
        document.addEventListener("keydown", this.onKeyDown);
    }

    private show(): void {
        document.body.setAttribute(STAGE_BODY_ATTR, "");

        if (!this.backdrop) {
            const el = document.createElement("div");
            el.id = BACKDROP_ID;
            el.addEventListener("click", () => {
                logger.log("Stage backdrop clicked → closing open block");
                blockState.closeAll();
            });
            document.body.appendChild(el);
            this.backdrop = el;
        }
    }

    private hide(): void {
        document.body.removeAttribute(STAGE_BODY_ATTR);
        this.backdrop?.remove();
        this.backdrop = null;
    }

    private onPointerDown = (event: PointerEvent): void => {
        const activeOwner = blockState.activeOwner();
        if (!activeOwner) return;

        const target = event.target as Element | null;
        if (!target) return;

        // Inside an open block or one of its child overlays → ignore.
        // We check for any open block element via [data-flux-editing] plus
        // any custom-element overlay (flux-*) so popups don't dismiss it.
        if (target.closest("[data-flux-editing]")) return;
        if (target.closest("flux-edit-open-btn, flux-action-toolbar, flux-upload-overlay, flux-link-overlay, flux-inline-handle")) return;
        if (target.id === BACKDROP_ID) return; // backdrop has its own handler

        // Click on bare page → close.
        logger.log("Click outside open block → closing");
        blockState.closeAll();
    };

    private onKeyDown = (event: KeyboardEvent): void => {
        if (event.key !== "Escape") return;
        if (!blockState.activeOwner()) return;
        logger.log("Esc pressed → closing open block");
        blockState.closeAll();
    };
}

export const stage = new FluxStage();
