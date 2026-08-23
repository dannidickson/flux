import { logger } from "../core/logger";
import type { HostToFrameMessage } from "../types/flux.interface";

const DRAFT_GATED_TYPES: HostToFrameMessage['type'][] = ['pageTemplateUpdate', 'blockUpdate', 'textUpdate', 'patchTemplateUpdate', 'richTextUpdate', 'richTextPatch'];

export default class HostChannel {
    private channelInstance!: MessageChannel;
    private frameSelector: string;
    private readyHandler: (event: MessageEvent) => void;
    private onFrameReady: (() => void) | null = null;
    private inlineEditInProgress = false;
    private previewingDraft: boolean = false;

    public get isInlineEditInProgress(): boolean {
        return this.inlineEditInProgress;
    }

    private get frame(): HTMLIFrameElement | null {
        return document.querySelector<HTMLIFrameElement>(this.frameSelector);
    }

    constructor(url: string, frameElement: string) {
        this.frameSelector = frameElement;

        if (!this.frame) {
            throw new Error(`iFrame cannot be found using ${frameElement}`);
        }

        this.createChannel();

        this.previewingDraft = this.computePreviewingDraft();

        this.readyHandler = (event: MessageEvent) => {
            if (event.data.type === 'FRAME_READY' && event.origin === window.location.origin) {
                logger.log("[channel] host received FRAME_READY — establishing channel");
                this.recreateChannel();
                this.previewingDraft = this.computePreviewingDraft();
                this.onFrameReady?.();
            }
        };
        window.addEventListener('message', this.readyHandler);
    }

    private createChannel(): void {
        this.channelInstance = new MessageChannel();

        this.channelInstance.port1.onmessage = (event: MessageEvent) =>
            this.receiveMessageFromFrame(event);
        this.channelInstance.port1.onmessageerror = (event: Event) =>
            this.receiveMessageError(event);

        this.channelInstance.port1.start();
    }

    private recreateChannel(): void {
        logger.log("Recreating MessageChannel for iframe reload");

        if (this.channelInstance) {
            this.channelInstance.port1.close();
        }

        this.createChannel();
        this.sendPortToFrame();
    }

    /**
     * Establish the channel with a frame that is already loaded.
     * On direct refresh, the parent's window.load fires after iframe load, so
     * the FRAME_READY message is missed; this call covers that race condition.
     */
    connectExistingFrame(): void {
        if (!this.frame?.contentWindow) return;

        logger.log("[channel] host proactively connecting to an already-loaded frame");
        this.sendPortToFrame();
        this.previewingDraft = this.computePreviewingDraft();
        this.onFrameReady?.();
    }

    private sendPortToFrame(): void {
        const frame = this.frame;
        const contentWindow = frame?.contentWindow;
        if (!contentWindow) {
            console.warn(`[channel] sendPortToFrame: no iframe contentWindow for ${this.frameSelector} — port handed to nothing`);
            return;
        }

        logger.log(`[channel] host → frame: handing off Host:Create port to`, frame?.getAttribute('src'));
        contentWindow.postMessage(
            { action: "Host:Create" },
            window.location.origin,
            [this.channelInstance.port2],
        );
    }

    private receiveMessageFromFrame(event: MessageEvent): void {
        const data = event.data;

        if (!data.type) {
            logger.warn("HostChannel received message without type:", data);
        }

        switch(data.type) {
            case 'inlineEditUpdate':
                this.handleInlineEditUpdate(data);
                break;
            case 'fileUploadClick':
                this.handleFileUploadClick(data);
                break;
            case 'linkFieldClick':
                this.handleLinkFieldClick(data);
                break;
            case 'editBlockClick':
                this.handleEditBlockClick(data);
                break;
            case 'gridFieldAction':
                this.handleGridFieldAction(data);
                break;
            case 'dragEventEnd':
                this.handleDragEventEnd(data);
                break;
            default:
                logger.warn("HostChannel received unknown message type:", data.type);
        }
    }

    /**
     * Replay a frame-side drop as a GridFieldOrderableRows /reorder POST,
     * so any extension hooks the gridfield component fires on reorder run
     * just as they would for a native drag.
     */
    private handleDragEventEnd(data: {
        key: string;
        owner: string;
        orderedIds: string[];
        sortField?: string;
    }): void {
        const gridField = document.querySelector<HTMLElement>(`.grid-field[data-name="${data.key}"]`);
        if (!gridField) {
            logger.warn(`HostChannel: no GridField for reorder data-name="${data.key}"`);
            return;
        }

        const reorderUrl = gridField.getAttribute('data-url-reorder');
        if (!reorderUrl) {
            logger.warn(`HostChannel: GridField "${data.key}" has no data-url-reorder — is GridFieldOrderableRows installed with immediateUpdate?`);
            return;
        }

        const sortField = data.sortField ?? 'Sort';
        const gridName = data.key.replace(/\./g, '_');

        // Shape expected by GridFieldOrderableRows::getSortedIDs:
        //   { [gridName]: { GridFieldEditableColumns: { [id]: { [sortField]: <sortValue> } } } }
        const form = new FormData();
        data.orderedIds.forEach((id, index) => {
            form.append(`${gridName}[GridFieldEditableColumns][${id}][${sortField}]`, String(index + 1));
        });

        const securityID = document.querySelector<HTMLInputElement>('input[name="SecurityID"]')?.value;
        if (securityID) form.append('SecurityID', securityID);

        fetch(reorderUrl, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'X-Requested-With': 'XMLHttpRequest', 'X-Pjax': 'CurrentField' },
            body: form,
        })
            .then((response) => {
                if (!response.ok) {
                    logger.warn(`Reorder POST → ${response.status}`);
                }
            })
            .catch((error) => logger.warn('Reorder POST failed:', error));
    }

    private handleInlineEditUpdate(data: { key: string; value: string; owner: string | null }): void {
        const { key, value, owner } = data;
        const input = this.findCmsField<HTMLInputElement>(key, owner);

        if (!input) {
            logger.warn(`HostChannel: could not find input for fx-key="${key}" fx-owner="${owner}"`);
            return;
        }

        // Use the native setter so React's controlled-input tracking stays in sync.
        const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        if (nativeSetter) {
            nativeSetter.call(input, value);
        } else {
            input.value = value;
        }

        this.inlineEditInProgress = true;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('keyup', { bubbles: true }));
        this.inlineEditInProgress = false;
    }

    private handleFileUploadClick(data: { key: string; owner: string | null }): void {
        const { key, owner } = data;
        const input = this.findCmsField<HTMLElement>(key, owner);

        if (!input) {
            logger.warn(`HostChannel: could not find upload field for fx-key="${key}" fx-owner="${owner}"`);
            return;
        }

        const holder = input.previousElementSibling;
        const btn = holder?.querySelector<HTMLElement>('.uploadfield-item__view-btn');

        if (!btn) {
            logger.warn(`HostChannel: could not find .uploadfield-item__view-btn for fx-key="${key}"`);
            return;
        }

        btn.click();
    }

    private handleLinkFieldClick(data: { key: string; owner: string | null }): void {
        const { key, owner } = data;
        const input = this.findCmsField<HTMLElement>(key, owner);

        if (!input) {
            logger.warn(`HostChannel: could not find link field for fx-key="${key}" fx-owner="${owner}"`);
            return;
        }

        const container = input.nextElementSibling;
        const btn = container?.querySelector<HTMLElement>('.link-picker__button');

        if (!btn) {
            logger.warn(`HostChannel: could not find .link-picker__button for fx-key="${key}"`);
            return;
        }

        btn.click();
    }

    private handleEditBlockClick(data: { owner: string; editLink?: string | null; inlineEditable?: boolean }): void {
        // CMS navigation only makes sense in split mode — in preview mode the
        // form isn't visible, so the frame just staged the block instead.
        const cmsMode = this.currentCmsMode();

        // Non-inline blocks / DataObjects: navigate the CMS to the record's
        // CMSEditLink. This is the "Open ↗" behaviour from the matrix.
        if (data.inlineEditable === false && data.editLink && cmsMode === 'split') {
            logger.log(`editBlockClick → navigating CMS to ${data.editLink}`);
            window.location.assign(data.editLink);
            return;
        }

        // In preview mode the frame is driving stage mode itself — nothing
        // for the host to do.
        if (cmsMode === 'preview') return;

        // Inline-editable blocks: open the nested element editor in the CMS
        // tree so the form fields become available to the live-update loop.
        const segments = window.FluxConfig?.Segments ?? [];
        const elementSegments = segments.filter((s) => s.Type === 'Element');
        const index = elementSegments.findIndex((s) => s.owner === data.owner);

        if (index === -1) {
            logger.warn(`HostChannel: no Element segment found for owner "${data.owner}"`);
            return;
        }

        const el = document.querySelectorAll<HTMLElement>('.element-editor__element')[index];

        if (!el) {
            logger.warn(`HostChannel: no .element-editor__element at index ${index}`);
            return;
        }

        el.click();
    }

    private handleGridFieldAction(data: { key: string; owner: string; action: string }): void {
        const { key, owner, action } = data;

        const gridField = document.querySelector<HTMLElement>(`.grid-field[data-name="${key}"]`);

        if (!gridField) {
            logger.warn(`HostChannel: no GridField found with data-name="${key}"`);
            return;
        }

        const row = gridField.querySelector<HTMLElement>(`[data-id="${owner}"]`);

        if (!row) {
            logger.warn(`HostChannel: no row with data-id="${owner}" in GridField "${key}"`);
            return;
        }

        // Each action has a list of fallback selectors because SilverStripe renders
        // GridField row buttons with varying classes / attribute names depending on
        // component and theme. We try the most specific marker first and fall back
        // to looser matches (href / name*) to catch legacy markup.
        let btn: HTMLElement | null = null;

        switch (action) {
            case 'edit':
                btn = row.querySelector<HTMLElement>('a.btn--icon-md, a.font-icon-edit, a[href*="/edit/"]');
                break;
            case 'delete':
                btn = row.querySelector<HTMLElement>('button.action--delete, button[name*="action_delete"]');
                break;
            case 'archive':
                btn = row.querySelector<HTMLElement>('button.action--archive, button[name*="action_archive"]');
                break;
        }

        if (!btn) {
            logger.warn(`HostChannel: no "${action}" button found in row ${owner} of GridField "${key}"`);
            return;
        }

        btn.click();
    }

    private currentCmsMode(): 'split' | 'preview' | 'edit' {
        const c = document.querySelector('.cms-container');
        if (!c) return 'edit';
        if (c.classList.contains('cms-container--preview-mode')) return 'preview';
        if (c.classList.contains('cms-container--split-mode')) return 'split';
        return 'edit';
    }

    private findCmsField<T extends HTMLElement>(key: string, owner: string | null): T | null {
        const selector = owner
            ? `[fx-key="${key}"][fx-owner="${owner}"]`
            : `[fx-key="${key}"]:not([fx-owner])`;

        return document.querySelector<T>(selector);
    }

    private receiveMessageError(event: Event): void {
        logger.error("HostChannel reports error from FrameChannel:", event);
    }

    setOnFrameReady(callback: () => void): void {
        this.onFrameReady = callback;
    }

    /**
     * Read the iframe's `src` and return whether it points at the Draft stage.
     * The result is cached in `this.previewingDraft` and refreshed on FRAME_READY,
     * so per-broadcast checks don't re-parse the URL.
     */
    private computePreviewingDraft(): boolean {
        try {
            const src = this.frame?.getAttribute('src') || '';
            const params = new URLSearchParams(src.split('?')[1] || '');
            return params.get('stage') === 'Stage';
        } catch {
            return false;
        }
    }

    broadcastMessage(message: HostToFrameMessage): void {
        if (this.inlineEditInProgress && message.type === 'textUpdate') {
            logger.log(`Suppressing textUpdate echo for "${message.key}" during inline edit`);
            return;
        }

        if (DRAFT_GATED_TYPES.includes(message.type) && !this.previewingDraft) {
            logger.log(`Suppressing ${message.type} — preview is not on Draft stage`);
            return;
        }

        if (message.type === 'textUpdate') {
            // If the preview iframe isn't in the DOM, this message goes into a
            // dead channel — the GridField detail form renders full-width with
            // no preview panel, so there's nothing to receive it. Surface that.
            if (!this.frame) {
                console.warn(
                    `[flux] textUpdate posted but NO preview iframe is present ` +
                    `(${this.frameSelector}). The detail form has no preview panel — nothing will receive this.`,
                    message,
                );
            } else {
                logger.log(`[textUpdate] host → frame: posting (iframe present)`, message);
            }
        }

        this.channelInstance.port1.postMessage(message);
    }

    destroy(): void {
        logger.log("Destroying HostChannel");
        window.removeEventListener('message', this.readyHandler);
        if (this.channelInstance) {
            this.channelInstance.port1.close();
        }
    }
}
