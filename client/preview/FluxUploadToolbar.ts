import uploadToolbarCss from './flux-upload-toolbar.shadow.css';
import { createSheet } from './shadow-sheet';

const styles = createSheet(uploadToolbarCss);

const PREVIEW_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>`;
const DELETE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>`;

export class FluxUploadToolbar extends HTMLElement {
    private _shadow: ShadowRoot;
    private _previewBtn: HTMLButtonElement;
    private _deleteBtn: HTMLButtonElement;

    constructor() {
        super();
        this._shadow = this.attachShadow({ mode: 'open' });
        this._shadow.adoptedStyleSheets = [styles];

        this._previewBtn = document.createElement('button');
        this._previewBtn.setAttribute('data-action', 'preview');
        this._previewBtn.innerHTML = `${PREVIEW_ICON}<span>Preview</span>`;

        this._deleteBtn = document.createElement('button');
        this._deleteBtn.setAttribute('data-action', 'delete');
        this._deleteBtn.innerHTML = `${DELETE_ICON}<span>Delete</span>`;

        this._shadow.appendChild(this._previewBtn);
        this._shadow.appendChild(this._deleteBtn);
    }

    onPreview(handler: () => void): void {
        this._previewBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            handler();
        });
    }

    onDelete(handler: () => void): void {
        this._deleteBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            handler();
        });
    }

    show(rect: DOMRect): void {
        this.style.top = `${rect.top + 4}px`;
        this.style.left = `${rect.right - 4}px`;
        this.setAttribute('visible', '');
    }

    hide(): void {
        this.removeAttribute('visible');
    }
}
