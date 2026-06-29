import editBtnCss from "../flux-edit-btn.shadow.css";
import { FluxOverlayElement } from "../FluxOverlayElement";
import { createSheet } from "../shadow-sheet";

const styles = createSheet(editBtnCss);

/**
 * Block-level affordance: the "Edit" / "Open" button that appears at the
 * top-right of a Flux block or relation item.
 *
 * Behaviour matrix (CMS mode × inline-editable) is wired in 6.3. For now
 * this is a thin label/state holder — clicks bubble as `flux-click` and
 * the orchestrator decides what to do.
 */
export class FluxEditOpenButton extends FluxOverlayElement {
    private _btn: HTMLButtonElement;

    constructor() {
        super(styles);
        this._btn = document.createElement("button");
        this.shadow.appendChild(this._btn);

        this._btn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.dispatchEvent(new CustomEvent("flux-click", { bubbles: true, composed: true }));
        });
    }

    set label(val: string) { this._btn.textContent = val; }
    get label(): string { return this._btn.textContent ?? ""; }

    set visible(val: boolean) {
        if (val) this.setAttribute("visible", "");
        else this.removeAttribute("visible");
    }

    set inline(val: boolean) {
        if (val) this.setAttribute("inline", "");
        else this.removeAttribute("inline");
    }
    get inline(): boolean { return this.hasAttribute("inline"); }

    set open(val: boolean) {
        if (val) this.setAttribute("open", "");
        else this.removeAttribute("open");
    }
    get open(): boolean { return this.hasAttribute("open"); }

    // Anchored inside its target so it positions relative to the block (the
    // existing CSS uses :host { position: absolute; top: 0; right: 0 }).
    // The hover controller toggles `visible`; nothing to position.
    position(): void {}
}
