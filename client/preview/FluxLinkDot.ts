import linkDotCss from './flux-link-dot.shadow.css';
import { createSheet } from './shadow-sheet';

const styles = createSheet(linkDotCss);

export class FluxLinkDot extends HTMLElement {
    constructor() {
        super();
        const shadow = this.attachShadow({ mode: 'open' });
        shadow.adoptedStyleSheets = [styles];
        shadow.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="#fff"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm2.92 1.83H5v-.75l9.06-9.06.75.75-8.89 9.06zM20.71 5.63l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83a1 1 0 0 0 0-1.41z"/></svg>`;
    }

    show(rect: DOMRect): void {
        this.style.top = `${rect.top - 2}px`;
        this.style.left = `${rect.right + 2}px`;
        this.setAttribute('visible', '');
    }

    hide(): void {
        this.removeAttribute('visible');
    }
}
