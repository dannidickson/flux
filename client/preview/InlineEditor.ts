import { logger } from '../core/logger';
import { registerFluxElements } from './FluxElements';

const TEXT_SELECTOR = '[fx-key][fx-type="Text"]';
const FILE_SELECTOR = '[fx-key][fx-type="UploadField"]';
const LINK_SELECTOR = '[fx-key][fx-type="LinkField"]';

export const activeEditingFields = new Set<string>();
const openBlocks = new Set<string>();
const scrollHiders = new Set<() => void>();

function fieldId(key: string, owner: string | null): string {
    return `${key}|${owner ?? ''}`;
}

function setBlockEditable(owner: string, editable: boolean): void {
    document.querySelectorAll<HTMLElement>(`[fx-owner="${owner}"][fx-type="Text"]`).forEach((el) => {
        el.contentEditable = String(editable);
    });
}

export function initInlineEditing(channel: MessagePort | null): void {
    if (!channel) {
        logger.warn('InlineEditor: no channel available, skipping setup');
        return;
    }

    registerFluxElements();

    window.addEventListener('scroll', () => scrollHiders.forEach((hide) => hide()), { passive: true, capture: true });

    initTextEditing(channel);
    initFileUploadEditing(channel);
    initLinkFieldEditing(channel);
    initGridFieldEditing(channel);
    initBlockEditButtons(channel);
}

function initTextEditing(channel: MessagePort): void {
    document.querySelectorAll<HTMLElement>(TEXT_SELECTOR).forEach((el) => {
        if (el.hasAttribute('fx-inline-ready')) return;
        el.setAttribute('fx-inline-ready', '1');

        const owner = el.getAttribute('fx-owner') ?? null;

        const isGridFieldChild = el.closest('[fx-type="GridField"]') !== null;
        const editable = owner === null || openBlocks.has(owner) || isGridFieldChild;
        el.contentEditable = String(editable);

        el.addEventListener('focus', () => {
            const key = el.getAttribute('fx-key')!;
            activeEditingFields.add(fieldId(key, owner));
        });

        el.addEventListener('blur', () => {
            const key = el.getAttribute('fx-key')!;
            activeEditingFields.delete(fieldId(key, owner));
        });

        el.addEventListener('input', () => {
            const key = el.getAttribute('fx-key')!;
            const value = el.innerText.trim() || ' ';

            logger.log(`Inline edit → key: "${key}", value: "${value}"`);

            channel.postMessage({
                type: 'inlineEditUpdate',
                key,
                value,
                owner,
            });
        });
    });
}

function initFileUploadEditing(channel: MessagePort): void {
    document.querySelectorAll<HTMLElement>(FILE_SELECTOR).forEach((el) => {
        if (el.hasAttribute('fx-inline-ready')) return;
        el.setAttribute('fx-inline-ready', '1');

        const key = el.getAttribute('fx-key')!;
        const owner = el.getAttribute('fx-owner') ?? null;

        const toolbar = document.createElement('flux-upload-toolbar');
        document.body.appendChild(toolbar);

        let hideTimeout: ReturnType<typeof setTimeout> | null = null;

        const showToolbar = () => {
            if (hideTimeout) { clearTimeout(hideTimeout); hideTimeout = null; }
            toolbar.show(el.getBoundingClientRect());
        };

        const hideToolbar = () => {
            hideTimeout = setTimeout(() => toolbar.hide(), 300);
        };

        scrollHiders.add(() => {
            if (hideTimeout) { clearTimeout(hideTimeout); hideTimeout = null; }
            toolbar.hide();
        });

        el.addEventListener('mouseenter', showToolbar);
        el.addEventListener('mouseleave', hideToolbar);
        toolbar.addEventListener('mouseenter', () => {
            if (hideTimeout) { clearTimeout(hideTimeout); hideTimeout = null; }
        });
        toolbar.addEventListener('mouseleave', hideToolbar);

        toolbar.onPreview(() => {
            logger.log(`File upload preview → key: "${key}"`);
            channel.postMessage({ type: 'fileUploadClick', key, owner });
        });

        toolbar.onDelete(() => {
            logger.log(`File upload unlink → key: "${key}"`);
            el.querySelector<HTMLElement>('.btn.uploadfield-item__remove-btn')?.click();
        });
    });
}

function initLinkFieldEditing(channel: MessagePort): void {
    document.querySelectorAll<HTMLElement>(LINK_SELECTOR).forEach((el) => {
        if (el.hasAttribute('fx-inline-ready')) return;
        el.setAttribute('fx-inline-ready', '1');

        const key = el.getAttribute('fx-key')!;
        const owner = el.getAttribute('fx-owner') ?? null;

        const dot = document.createElement('flux-link-dot');
        document.body.appendChild(dot);

        el.addEventListener('mouseenter', () => {
            const range = document.createRange();
            range.selectNodeContents(el);
            dot.show(range.getBoundingClientRect());
        });

        let hideTimeout: ReturnType<typeof setTimeout> | null = null;

        const hideDot = () => dot.hide();

        scrollHiders.add(() => {
            if (hideTimeout) { clearTimeout(hideTimeout); hideTimeout = null; }
            dot.hide();
        });

        el.addEventListener('mouseleave', () => {
            hideTimeout = setTimeout(hideDot, 500);
        });

        dot.addEventListener('mouseenter', () => {
            if (hideTimeout) { clearTimeout(hideTimeout); hideTimeout = null; }
        });

        dot.addEventListener('mouseleave', hideDot);

        dot.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            logger.log(`Link field edit dot click → key: "${key}"`);

            channel.postMessage({
                type: 'linkFieldClick',
                key,
                owner,
            });
        });
    });
}

const GRID_ACTION_ICONS: Record<string, string> = {
    edit: `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm2.92 1.83H5v-.75l9.06-9.06.75.75-8.89 9.06zM20.71 5.63l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83a1 1 0 0 0 0-1.41z"/></svg>`,
    delete: `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>`,
    archive: `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M20.54 5.23l-1.39-1.68C18.88 3.21 18.47 3 18 3H6c-.47 0-.88.21-1.16.55L3.46 5.23C3.17 5.57 3 6.02 3 6.5V19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6.5c0-.48-.17-.93-.46-1.27zM12 17.5L6.5 12H10v-2h4v2h3.5L12 17.5zM5.12 5l.81-1h12l.94 1H5.12z"/></svg>`,
};

function initGridFieldEditing(channel: MessagePort): void {
    document.querySelectorAll<HTMLElement>('[fx-type="GridField"][fx-key][fx-owner]').forEach((el) => {
        if (el.hasAttribute('fx-inline-ready')) return;
        el.setAttribute('fx-inline-ready', '1');

        const key = el.getAttribute('fx-key')!;
        const owner = el.getAttribute('fx-owner')!;
        const actions: string[] = JSON.parse(el.getAttribute('fx-grid-actions') ?? '["edit"]');

        const toolbar = document.createElement('flux-grid-toolbar');
        document.body.appendChild(toolbar);

        actions.forEach((action) => {
            toolbar.addAction(
                action,
                GRID_ACTION_ICONS[action] ?? action,
                () => {
                    logger.log(`GridField action → key: "${key}", owner: "${owner}", action: "${action}"`);
                    channel.postMessage({ type: 'gridFieldAction', key, owner, action });
                },
            );
        });

        let hideTimeout: ReturnType<typeof setTimeout> | null = null;

        const showToolbar = () => {
            if (hideTimeout) { clearTimeout(hideTimeout); hideTimeout = null; }
            toolbar.show(el.getBoundingClientRect());
        };

        const hideToolbar = () => {
            hideTimeout = setTimeout(() => toolbar.hide(), 300);
        };

        scrollHiders.add(() => {
            if (hideTimeout) { clearTimeout(hideTimeout); hideTimeout = null; }
            toolbar.hide();
        });

        el.addEventListener('mouseenter', showToolbar);
        el.addEventListener('mouseleave', hideToolbar);
        toolbar.addEventListener('mouseenter', () => {
            if (hideTimeout) { clearTimeout(hideTimeout); hideTimeout = null; }
        });
        toolbar.addEventListener('mouseleave', hideToolbar);
    });
}

function initBlockEditButtons(channel: MessagePort): void {
    const owners = new Set<string>();
    document.querySelectorAll<HTMLElement>('[fx-owner]').forEach((el) => {
        owners.add(el.getAttribute('fx-owner')!);
    });

    owners.forEach((owner) => {
        let ownerEl: HTMLElement | null = null;
        try {
            ownerEl = document.querySelector<HTMLElement>(owner);
        } catch {
            // owner is not a valid CSS selector (e.g. a numeric GridField record ID)
            return;
        }

        if (!ownerEl) {
            return;
        }

        if (ownerEl.hasAttribute('fx-block-btn-ready')) return;
        ownerEl.setAttribute('fx-block-btn-ready', '1');

        if (getComputedStyle(ownerEl).position === 'static') {
            ownerEl.style.position = 'relative';
        }

        const isInlineEditable = ownerEl.querySelector(TEXT_SELECTOR) !== null;

        const btn = document.createElement('flux-edit-btn');

        const updateButton = () => {
            if (!isInlineEditable) {
                btn.label = 'Open';
                return;
            }
            btn.label = openBlocks.has(owner) ? 'Edit / Close' : 'Edit';
        };

        updateButton();

        ownerEl.addEventListener('mouseenter', () => { btn.visible = true; });
        ownerEl.addEventListener('mouseleave', () => { btn.visible = false; });

        btn.addEventListener('flux-click', () => {
            if (isInlineEditable) {
                if (openBlocks.has(owner)) {
                    openBlocks.delete(owner);
                    setBlockEditable(owner, false);
                } else {
                    openBlocks.add(owner);
                    setBlockEditable(owner, true);
                }
                updateButton();
            }

            logger.log(`Block button click → owner: "${owner}", open: ${openBlocks.has(owner)}`);

            channel.postMessage({
                type: 'editBlockClick',
                owner,
            });
        });

        ownerEl.appendChild(btn);
    });
}
