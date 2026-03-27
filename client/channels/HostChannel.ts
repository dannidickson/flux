import { logger } from "../core/logger";

export default class HostChannel {
    channelType: string;
    channelInstance!: MessageChannel;
    private frameSelector: string;
    private readyHandler: (event: MessageEvent) => void;
    private onFrameReady: (() => void) | null = null;
    private inlineEditInProgress = false;

    public get isInlineEditInProgress(): boolean {
        return this.inlineEditInProgress;
    }

    private get frame(): HTMLIFrameElement | null {
        return document.querySelector<HTMLIFrameElement>(this.frameSelector);
    }

    constructor(url: string, frameElement: string) {
        this.channelType = "MessageChannel";
        this.frameSelector = frameElement;

        if (!this.frame) {
            throw new Error(`iFrame cannot be found using ${frameElement}`);
        }

        this.createChannel();

        this.readyHandler = (event: MessageEvent) => {
            if (event.data.type === 'FRAME_READY' && event.origin === window.location.origin) {
                logger.log("Frame ready - establishing channel");
                this.recreateChannel();
                this.onFrameReady?.();
            }
        };
        window.addEventListener('message', this.readyHandler);
    }

    private createChannel() {
        this.channelInstance = new MessageChannel();

        this.channelInstance.port1.onmessage = (event: MessageEvent) =>
            this.recieveMessageFromFrame(event);
        this.channelInstance.port1.onmessageerror = (event: Event) =>
            this.recieveMessageError(event);

        this.channelInstance.port1.start();
    }

    private recreateChannel() {
        logger.log("Recreating MessageChannel for iframe reload");

        if (this.channelInstance) {
            this.channelInstance.port1.close();
        }

        this.createChannel();
        this.sendPortToFrame();
    }

    sendPortToFrame() {
        const message = {
            action: "Host:Create",
        };

        // @ts-ignore
        this.frame.contentWindow.postMessage(message, window.location.origin, [
            this.channelInstance.port2,
        ]);
    }

    recieveMessageFromFrame(event: MessageEvent) {
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
            default:
                logger.warn("HostChannel received unknown message type:", data.type);
        }

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

    private handleEditBlockClick(data: { owner: string }): void {
        const segments: any[] = (window as any).FluxConfig?.Segments ?? [];
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

    private findCmsField<T extends HTMLElement>(key: string, owner: string | null): T | null {
        const selector = owner
            ? `[fx-key="${key}"][fx-owner="${owner}"]`
            : `[fx-key="${key}"]:not([fx-owner])`;

        return document.querySelector<T>(selector);
    }

    recieveMessageError(event: Event) {
        logger.error("HostChannel reports error from FrameChannel:", event);
    }

    setOnFrameReady(callback: () => void): void {
        this.onFrameReady = callback;
    }

    private isPreviewingDraft(): boolean {
        try {
            const src = this.frame?.getAttribute('src') || '';
            const params = new URLSearchParams(src.split('?')[1] || '');
            return params.get('stage') === 'Stage';
        } catch {
            return false;
        }
    }

    broadcastMessage(broadcastMessage: any) {
        if (this.inlineEditInProgress && broadcastMessage.type === 'textUpdate') {
            logger.log(`Suppressing textUpdate echo for "${broadcastMessage.key}" during inline edit`);
            return;
        }

        const updateTypes = ['pageTemplateUpdate', 'blockUpdate', 'textUpdate', 'patchTemplateUpdate'];
        if (updateTypes.includes(broadcastMessage.type) && !this.isPreviewingDraft()) {
            logger.log(`Suppressing ${broadcastMessage.type} — preview is not on Draft stage`);
            return;
        }

        this.channelInstance.port1.postMessage(broadcastMessage);
    }

    destroy() {
        logger.log("Destroying HostChannel");
        window.removeEventListener('message', this.readyHandler);
        if (this.channelInstance) {
            this.channelInstance.port1.close();
        }
    }
}
