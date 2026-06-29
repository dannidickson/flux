import uploadToolbarCss from "../flux-upload-toolbar.shadow.css";
import { FluxOverlayElement } from "../FluxOverlayElement";
import { createSheet } from "../shadow-sheet";

const styles = createSheet(uploadToolbarCss);

const PREVIEW_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>`;
const DELETE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>`;

/**
 * Field-level affordance for UploadField (image/file) bindings.
 * Preview / Remove. Only active when the containing block is open.
 */
export class FluxUploadOverlay extends FluxOverlayElement {
    private _previewBtn: HTMLButtonElement;
    private _deleteBtn: HTMLButtonElement;

    constructor() {
        super(styles);

        this._previewBtn = document.createElement("button");
        this._previewBtn.setAttribute("data-action", "preview");
        this._previewBtn.innerHTML = `${PREVIEW_ICON}<span>Preview</span>`;

        this._deleteBtn = document.createElement("button");
        this._deleteBtn.setAttribute("data-action", "delete");
        this._deleteBtn.innerHTML = `${DELETE_ICON}<span>Delete</span>`;

        this.shadow.appendChild(this._previewBtn);
        this.shadow.appendChild(this._deleteBtn);
    }

    onPreview(handler: () => void): void {
        this._previewBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            handler();
        });
    }

    onDelete(handler: () => void): void {
        this._deleteBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            handler();
        });
    }

    show(rect?: DOMRect): void {
        const r = rect ?? this.target?.getBoundingClientRect();
        if (!r) return;
        this.style.top = `${r.top + 4}px`;
        this.style.left = `${r.right - 4}px`;
        this.setAttribute("visible", "");
    }
}
