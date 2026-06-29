import gridToolbarCss from "../flux-grid-toolbar.shadow.css";
import { FluxOverlayElement } from "../FluxOverlayElement";
import { createSheet } from "../shadow-sheet";

const styles = createSheet(gridToolbarCss);

/**
 * Field-level affordance for GridField / relation items.
 * Renders the actions (edit / archive / delete) declared on the GridField.
 */
export class FluxActionToolbar extends FluxOverlayElement {
    constructor() {
        super(styles);
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
        this.shadow.appendChild(btn);
    }

    show(rect?: DOMRect): void {
        const r = rect ?? this.target?.getBoundingClientRect();
        if (!r) return;
        this.style.top = `${r.top + 4}px`;
        this.style.left = `${r.right - 4}px`;
        this.setAttribute("visible", "");
    }
}
