import editBtnCss from "./flux-edit-btn.shadow.css";
import { createSheet } from "./shadow-sheet";

const styles = createSheet(editBtnCss);

export class FluxEditButton extends HTMLElement {
    private _btn: HTMLButtonElement;

    constructor() {
        super();
        const shadow = this.attachShadow({ mode: "open" });
        shadow.adoptedStyleSheets = [styles];
        this._btn = document.createElement("button");
        shadow.appendChild(this._btn);

        this._btn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.dispatchEvent(
                new CustomEvent("flux-click", {
                    bubbles: true,
                    composed: true,
                }),
            );
        });
    }

    set label(val: string) {
        this._btn.textContent = val;
    }
    get label(): string {
        return this._btn.textContent ?? "";
    }

    set visible(val: boolean) {
        if (val) {
            this.setAttribute("visible", "");
        } else {
            this.removeAttribute("visible");
        }
    }
}
