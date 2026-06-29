/**
 * Single hover state machine for the preview frame.
 *
 * Replaces the per-widget `hoverWithGrace` callbacks. Resolves the layering
 * bug where a block button and an inner fx-key affordance could both render
 * at once.
 *
 * Rules:
 *  - The cursor's nearest `[fx-owner]` ancestor is the "active block".
 *  - If that block is *closed*, only the block-level overlays (Edit/Open
 *    button, action toolbar) show. Inner fx-key overlays are suppressed.
 *  - If that block is *open*, inner fx-key overlays show normally; the
 *    block-level button stays visible as a "Close" affordance.
 *  - When the cursor leaves both the target and the overlay, a grace
 *    timer hides the overlay so the user can move onto popups.
 */

import { blockState } from "./FluxBlockState";

export type HoverLayer = "block" | "field";

interface RegisteredOverlay {
    layer: HoverLayer;
    /** Element whose hover lifecycle triggers this overlay. */
    target: HTMLElement;
    /** The overlay element itself (so cursor moves onto it don't dismiss it). */
    overlay: HTMLElement;
    show: () => void;
    hide: () => void;
}

const GRACE_MS = 200;

class FluxHoverController {
    private readonly entries: RegisteredOverlay[] = [];
    private readonly hideTimers = new Map<RegisteredOverlay, ReturnType<typeof setTimeout>>();
    private installed = false;

    install(): void {
        if (this.installed) return;
        this.installed = true;

        document.addEventListener("pointerover", this.onPointerOver, { capture: true });
        document.addEventListener("pointerout", this.onPointerOut, { capture: true });
        window.addEventListener("scroll", this.hideAll, { passive: true, capture: true });

        blockState.subscribe((event) => {
            if (!event.open) this.hideAll();
        });
    }

    register(entry: RegisteredOverlay): () => void {
        this.entries.push(entry);
        return () => {
            const i = this.entries.indexOf(entry);
            if (i >= 0) this.entries.splice(i, 1);
            this.cancelHide(entry);
            entry.hide();
        };
    }

    reset(): void {
        for (const entry of [...this.entries]) {
            this.cancelHide(entry);
            entry.hide();
        }
        this.entries.length = 0;
    }

    private isLayerActive(entry: RegisteredOverlay, ctx: { blockOwner: string | null }): boolean {
        if (entry.layer === "block") return true;
        // Field-layer overlays only activate when their containing block is open.
        if (!ctx.blockOwner) return false;
        return blockState.isOpen(ctx.blockOwner);
    }

    private onPointerOver = (event: PointerEvent): void => {
        const node = event.target as Element | null;
        if (!node) return;

        const block = node.closest<HTMLElement>("[fx-owner]");
        const blockOwner = block?.getAttribute("fx-owner") ?? null;
        const ctx = { blockOwner };

        for (const entry of this.entries) {
            if (entry.overlay.contains(node)) {
                this.cancelHide(entry);
                continue;
            }

            if (!entry.target.contains(node)) continue;

            // Block-layer overlays whose target sits *inside* a different
            // open block should stand down — that block owns the stage.
            if (entry.layer === "block" && blockOwner && blockState.activeOwner() && blockState.activeOwner() !== this.ownerOf(entry.target)) {
                continue;
            }

            if (!this.isLayerActive(entry, ctx)) continue;

            this.cancelHide(entry);
            entry.show();
        }
    };

    private onPointerOut = (event: PointerEvent): void => {
        const related = (event.relatedTarget as Element | null) ?? null;

        for (const entry of this.entries) {
            const wasInside = entry.target.contains(event.target as Node) || entry.overlay.contains(event.target as Node);
            if (!wasInside) continue;

            const stillInside = related && (entry.target.contains(related) || entry.overlay.contains(related));
            if (stillInside) continue;

            this.scheduleHide(entry);
        }
    };

    private ownerOf(el: HTMLElement): string | null {
        return el.closest<HTMLElement>("[fx-owner]")?.getAttribute("fx-owner") ?? null;
    }

    private scheduleHide(entry: RegisteredOverlay): void {
        this.cancelHide(entry);
        const t = setTimeout(() => {
            this.hideTimers.delete(entry);
            entry.hide();
        }, GRACE_MS);
        this.hideTimers.set(entry, t);
    }

    private cancelHide(entry: RegisteredOverlay): void {
        const t = this.hideTimers.get(entry);
        if (t !== undefined) {
            clearTimeout(t);
            this.hideTimers.delete(entry);
        }
    }

    private hideAll = (): void => {
        for (const entry of this.entries) {
            this.cancelHide(entry);
            entry.hide();
        }
    };
}

export const hoverController = new FluxHoverController();
export type { FluxHoverController };
