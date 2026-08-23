import { logger } from "../core/logger";

/**
 * Establish port-based messaging channel with the parent frame.
 * Message handler can be passed to constructor or set via onReceivedMessage property.
 *
 * @example client/cms-live-updates/frame.ts
 */
export default class FrameChannel {
    channel: MessagePort | null = null;
    private messageHandler: (event: MessageEvent) => void;
    public onReceivedMessage: (event: MessageEvent) => void;

    constructor(onReceivedMessage?: (event: MessageEvent) => void) {
        this.messageHandler = (event: MessageEvent) => this.setupMessageEvents(event);
        window.addEventListener("message", this.messageHandler);

        this.onReceivedMessage = onReceivedMessage || this.defaultMessageHandler.bind(this);

        if (window.parent !== window) {
            logger.log("[channel] frame posting FRAME_READY →", window.location.href);
            window.parent.postMessage({ type: 'FRAME_READY' }, window.location.origin);
        } else {
            console.warn("[channel] frame has no parent — not in an iframe, FRAME_READY not sent");
        }
    }

    private setupMessageEvents(event: MessageEvent): void {
        if (event.origin !== window.location.origin) {
            logger.error("Origin mismatch:", event.origin, "vs", window.location.origin);
            return;
        }

        if (event.data.action === "Host:Create") {
            logger.log("[channel] frame received Host:Create — port connected");

            if (!event.ports || event.ports.length === 0) {
                console.warn("[channel] Host:Create arrived with NO ports — channel dead");
                return;
            }

            this.channel = event.ports[0];
            this.channel.onmessage = (event: MessageEvent) => {
                logger.log("[channel] frame port message:", event.data?.type);
                this.onReceivedMessage(event);
            };
            this.channel.start();
        }
    }

    /**
     * Fallback used when no custom `onReceivedMessage` handler was supplied.
     *
     * @param event
     */
    private defaultMessageHandler(event: MessageEvent): void {
        logger.log('Message called doing nothing', event);
    }
}
