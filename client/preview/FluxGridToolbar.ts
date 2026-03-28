import gridToolbarCss from "./flux-grid-toolbar.shadow.css";
import { createSheet } from "./shadow-sheet";

const styles = createSheet(gridToolbarCss);

export class FluxGridToolbar extends HTMLElement {
    private _shadow: ShadowRoot;

    constructor() {
        super();
        this._shadow = this.attachShadow({ mode: "open" });
        this._shadow.adoptedStyleSheets = [styles];
    }

    addAction(action: string, icon: string, onClick: () => void): void {
        const label = action.charAt(0).toUpperCase() + action.slice(1);
        const btn = document.createElement("button");
        btn.setAttribute("data-action", action);
        btn.innerHTML = `${icon}<span>${label}</span>`;
        btn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            onClick();
        });
        this._shadow.appendChild(btn);
    }

    show(rect: DOMRect): void {
        this.style.top = `${rect.top + 4}px`;
        this.style.left = `${rect.right - 4}px`;
        this.setAttribute("visible", "");
    }

    hide(): void {
        this.removeAttribute("visible");
    }
}
