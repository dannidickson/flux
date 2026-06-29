import { logger } from '../core/logger';
import { blockState } from './FluxBlockState';
import { registerFluxElements } from './FluxElements';
import { hoverController } from './FluxHoverController';
import { FluxScopeGuard } from './FluxScopeGuard';
import { initSortable } from './FluxSortable';
import { stage } from './FluxStage';

const TEXT_SELECTOR = '[fx-key][fx-type="Text"]';
const FILE_SELECTOR = '[fx-key][fx-type="UploadField"]';
const LINK_SELECTOR = '[fx-key][fx-type="LinkField"]';

export const activeEditingFields = new Set<string>();

const TOOLBAR_TAGS = 'flux-upload-overlay, flux-link-overlay, flux-action-toolbar, flux-edit-open-btn, flux-inline-handle';
const READY_ATTRS = ['fx-inline-ready', 'fx-block-btn-ready', 'data-flux-block'];

let initAbort: AbortController | null = null;
let blockStateUnsubscribes: Array<() => void> = [];

/**
 * Tear down anything from a previous init: abort listeners, reset the hover
 * controller, remove the body-appended toolbars, and clear the "already
 * bound" sentinels so elements can be re-processed.
 */
function teardownPreviousInit(): void {
    initAbort?.abort();
    initAbort = null;

    blockStateUnsubscribes.forEach(fn => fn());
    blockStateUnsubscribes = [];

    hoverController.reset();
    blockState.closeAll();

    document.querySelectorAll(TOOLBAR_TAGS).forEach((el) => el.remove());

    for (const attr of READY_ATTRS) {
        document.querySelectorAll(`[${attr}]`).forEach((el) => el.removeAttribute(attr));
    }
}

function fieldId(key: string, owner: string | null): string {
    return `${key}|${owner ?? ''}`;
}

function setBlockEditable(owner: string, editable: boolean): void {
    document.querySelectorAll<HTMLElement>(`[fx-owner="${owner}"][fx-type="Text"]`).forEach((el) => {
        el.contentEditable = String(editable);
    });
}

/**
 * Owners come in two flavours:
 *   - selector-style ("#e42") for Elemental blocks — the owner string IS the
 *     CSS selector of the block's container element
 *   - id-style ("42")          for relation items — the owner is the record
 *     id and the container is the row carrying [fx-owner="42"]
 *
 * Try id-attribute lookup first, fall back to selector lookup.
 */
function resolveOwnerEl(owner: string): HTMLElement | null {
    const byAttr = document.querySelector<HTMLElement>(`[fx-owner="${CSS.escape(owner)}"]`);
    if (byAttr) return byAttr;
    try {
        return document.querySelector<HTMLElement>(owner);
    } catch {
        return null;
    }
}

export function initInlineEditing(channel: MessagePort | null): void {
    if (!channel) {
        logger.warn('InlineEditor: no channel available, skipping setup');
        return;
    }

    registerFluxElements();
    hoverController.install();
    stage.install();
    teardownPreviousInit();

    initAbort = new AbortController();
    const signal = initAbort.signal;
    const guard = FluxScopeGuard.current();

    // Reflect open/close into the DOM + contentEditable for any block.
    blockStateUnsubscribes.push(blockState.subscribe(({ owner, open }) => {
        setBlockEditable(owner, open);
        const ownerEl = resolveOwnerEl(owner);
        if (ownerEl) {
            ownerEl.toggleAttribute('data-flux-editing', open);
        }
    }));

    initTextEditing(channel, signal, guard);
    initFileUploadEditing(channel, signal, guard);
    initLinkFieldEditing(channel, signal, guard);
    initGridFieldEditing(channel, signal, guard);
    initBlockEditButtons(channel, signal, guard);
    initSortable(channel);

    // If the CMS is editing a single block or relation item, auto-stage it
    // so the user lands on the right "stage" without an extra click.
    autoStageScopedOwner();
}

/**
 * When scope.kind is 'block' or 'relation-item', the CMS is editing one
 * specific thing — open it in the frame so its stage backdrop and inner
 * affordances are immediately available.
 */
function autoStageScopedOwner(): void {
    const scope = window.FluxScope;
    if (!scope || scope.kind === 'page' || !scope.ownerId) return;

    // Defer to next frame so the block container has had its
    // data-flux-block attribute stamped by initBlockEditButtons.
    requestAnimationFrame(() => {
        blockState.openBlock(scope.ownerId!);
    });
}

function initTextEditing(channel: MessagePort, signal: AbortSignal, guard: FluxScopeGuard): void {
    document.querySelectorAll<HTMLElement>(TEXT_SELECTOR).forEach((el) => {
        if (el.hasAttribute('fx-inline-ready')) return;
        el.setAttribute('fx-inline-ready', '1');

        if (!guard.canEdit(el)) {
            el.setAttribute('fx-out-of-scope', '');
            return;
        }

        const owner = el.getAttribute('fx-owner') ?? null;

        const isGridFieldChild = el.closest('[fx-type="GridField"]') !== null;
        // Page-scope text without an owner is always editable; otherwise the
        // text only becomes editable when its block is open (or when nested
        // inside a GridField item, where the row itself is the unit).
        const initialEditable = owner === null || isGridFieldChild;
        el.contentEditable = String(initialEditable);

        el.addEventListener('focus', () => {
            const key = el.getAttribute('fx-key')!;
            activeEditingFields.add(fieldId(key, owner));
        }, { signal });

        el.addEventListener('blur', () => {
            const key = el.getAttribute('fx-key')!;
            activeEditingFields.delete(fieldId(key, owner));
        }, { signal });

        el.addEventListener('input', () => {
            const key = el.getAttribute('fx-key')!;
            // Fallback to a single space so the element keeps a text node and stays visible.
            const value = el.innerText.trim() || ' ';

            logger.log(`Inline edit → key: "${key}", value: "${value}"`);

            channel.postMessage({
                type: 'inlineEditUpdate',
                key,
                value,
                owner,
            });
        }, { signal });
    });
}

function initFileUploadEditing(channel: MessagePort, _signal: AbortSignal, guard: FluxScopeGuard): void {
    document.querySelectorAll<HTMLElement>(FILE_SELECTOR).forEach((el) => {
        if (el.hasAttribute('fx-inline-ready')) return;
        el.setAttribute('fx-inline-ready', '1');

        if (!guard.canEdit(el)) {
            el.setAttribute('fx-out-of-scope', '');
            return;
        }

        const key = el.getAttribute('fx-key')!;
        const owner = el.getAttribute('fx-owner') ?? null;

        const toolbar = document.createElement('flux-upload-overlay');
        document.body.appendChild(toolbar);

        hoverController.register({
            layer: 'field',
            target: el,
            overlay: toolbar,
            show: () => toolbar.show(el.getBoundingClientRect()),
            hide: () => toolbar.hide(),
        });

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

function initLinkFieldEditing(channel: MessagePort, signal: AbortSignal, guard: FluxScopeGuard): void {
    document.querySelectorAll<HTMLElement>(LINK_SELECTOR).forEach((el) => {
        if (el.hasAttribute('fx-inline-ready')) return;
        el.setAttribute('fx-inline-ready', '1');

        if (!guard.canEdit(el)) {
            el.setAttribute('fx-out-of-scope', '');
            return;
        }

        const key = el.getAttribute('fx-key')!;
        const owner = el.getAttribute('fx-owner') ?? null;

        const dot = document.createElement('flux-link-overlay');
        document.body.appendChild(dot);

        hoverController.register({
            layer: 'field',
            target: el,
            overlay: dot,
            show: () => {
                const range = document.createRange();
                range.selectNodeContents(el);
                dot.show(range.getBoundingClientRect());
            },
            hide: () => dot.hide(),
        });

        dot.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            logger.log(`Link field edit dot click → key: "${key}"`);

            channel.postMessage({
                type: 'linkFieldClick',
                key,
                owner,
            });
        }, { signal });
    });
}

const GRID_ACTION_ICONS: Record<string, string> = {
    edit: `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm2.92 1.83H5v-.75l9.06-9.06.75.75-8.89 9.06zM20.71 5.63l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83a1 1 0 0 0 0-1.41z"/></svg>`,
    delete: `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>`,
    archive: `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M20.54 5.23l-1.39-1.68C18.88 3.21 18.47 3 18 3H6c-.47 0-.88.21-1.16.55L3.46 5.23C3.17 5.57 3 6.02 3 6.5V19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6.5c0-.48-.17-.93-.46-1.27zM12 17.5L6.5 12H10v-2h4v2h3.5L12 17.5zM5.12 5l.81-1h12l.94 1H5.12z"/></svg>`,
};

function initGridFieldEditing(channel: MessagePort, _signal: AbortSignal, guard: FluxScopeGuard): void {
    document.querySelectorAll<HTMLElement>('[fx-type="GridField"][fx-key][fx-owner]').forEach((el) => {
        if (el.hasAttribute('fx-inline-ready')) return;
        el.setAttribute('fx-inline-ready', '1');

        if (!guard.canEdit(el)) {
            el.setAttribute('fx-out-of-scope', '');
            return;
        }

        const key = el.getAttribute('fx-key')!;
        const owner = el.getAttribute('fx-owner')!;
        const actions: string[] = JSON.parse(el.getAttribute('fx-grid-actions') ?? '["edit"]');

        const toolbar = document.createElement('flux-action-toolbar');
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

        hoverController.register({
            layer: 'block',
            target: el,
            overlay: toolbar,
            show: () => toolbar.show(el.getBoundingClientRect()),
            hide: () => toolbar.hide(),
        });
    });
}

/**
 * Edit/Open button — implements the behaviour matrix from flux-v2-ui-plan.md §4.
 *
 *   inline-editable + (split | preview)  → "Edit" / "Close", toggles block open
 *   non-inline       + split             → "Open ↗", host navigates CMS to editLink
 *   non-inline       + preview           → "Open ↗", host navigates CMS to editLink
 */
function initBlockEditButtons(channel: MessagePort, signal: AbortSignal, guard: FluxScopeGuard): void {
    const owners = new Set<string>();
    document.querySelectorAll<HTMLElement>('[fx-owner]').forEach((el) => {
        owners.add(el.getAttribute('fx-owner')!);
    });

    owners.forEach((owner) => {
        // In block / relation-item scope, only the active owner gets a button.
        if (guard.kind !== 'page' && owner !== (window.FluxScope?.ownerId ?? null)) {
            return;
        }

        const ownerEl = resolveOwnerEl(owner);
        if (!ownerEl) return;
        if (ownerEl.hasAttribute('fx-block-btn-ready')) return;
        ownerEl.setAttribute('fx-block-btn-ready', '1');
        // Marker so CSS can target the block container (vs its fx-key children).
        ownerEl.setAttribute('data-flux-block', '');

        if (getComputedStyle(ownerEl).position === 'static') {
            ownerEl.style.position = 'relative';
        }

        const isInlineEditable = ownerEl.querySelector(TEXT_SELECTOR) !== null;
        const editLink = ownerEl.getAttribute('fx-edit-link');
        // If a block has no inline-editable content and no edit link, the
        // button has nothing useful to do — skip it.
        if (!isInlineEditable && !editLink) return;

        const btn = document.createElement('flux-edit-open-btn');
        btn.inline = isInlineEditable;

        const updateButton = () => {
            if (!isInlineEditable) {
                btn.label = 'Open ↗';
                btn.open = false;
                return;
            }
            const isOpen = blockState.isOpen(owner);
            btn.label = isOpen ? 'Close' : 'Edit';
            btn.open = isOpen;
        };

        updateButton();
        blockStateUnsubscribes.push(blockState.subscribe((event) => {
            if (event.owner === owner) updateButton();
        }));

        hoverController.register({
            layer: 'block',
            target: ownerEl,
            overlay: btn,
            show: () => { btn.visible = true; },
            hide: () => { btn.visible = false; },
        });

        btn.addEventListener('flux-click', () => {
            // In preview mode the CMS form isn't visible, so navigating to the
            // record's edit link would leave the user stranded. Stage the block
            // instead — the action toolbar / upload / link overlays still work
            // against it, and the user can close out with Esc / click-outside.
            const mode = window.FluxMode ?? 'split';
            const shouldStage = isInlineEditable || mode === 'preview';

            if (shouldStage) {
                blockState.toggle(owner);
                updateButton();
            }

            logger.log(`Block button click → owner: "${owner}", inline: ${isInlineEditable}, mode: ${mode}, open: ${blockState.isOpen(owner)}`);

            channel.postMessage({
                type: 'editBlockClick',
                owner,
                editLink,
                inlineEditable: isInlineEditable,
            });
        }, { signal });

        ownerEl.appendChild(btn);
    });
}
