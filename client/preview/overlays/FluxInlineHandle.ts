import { FluxOverlayElement } from "../FluxOverlayElement";
import { createSheet } from "../shadow-sheet";

/**
 * Visual edit affordance for `fx-type="Text"` fields when their block is
 * open. Currently a thin underline + caret cursor styling; the actual
 * contenteditable binding is set on the target element itself by
 * InlineEditor. This overlay exists so the field gets a consistent
 * "I am editable" visual treatment without baking it into every theme.
 *
 * Reserved for use in 6.3+. Not registered yet — kept as a stub so the
 * overlays/ directory presents the full set described in the plan.
 */
const styles = createSheet(`
:host {
    position: fixed;
    z-index: 9998;
    pointer-events: none;
    background: var(--flux-color-inline-bar, rgba(26, 72, 119, 0.85));
    height: 2px;
    opacity: 0;
    transition: opacity 0.12s;
}
:host([visible]) { opacity: 1; }
`);

export class FluxInlineHandle extends FluxOverlayElement {
    constructor() {
        super(styles);
    }

    show(rect?: DOMRect): void {
        const r = rect ?? this.target?.getBoundingClientRect();
        if (!r) return;
        this.style.top = `${r.bottom}px`;
        this.style.left = `${r.left}px`;
        this.style.width = `${r.width}px`;
        this.setAttribute("visible", "");
    }
}
