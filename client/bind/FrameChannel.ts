import { logger } from "../core/logger";

/**
 * FrameChannel can implement the onRecievedMessage either in the constructor, or via frame.onRecievedMessage

 * @example client/cms-live-updates/frame.ts
 */
export default class FrameChannel {
    channel: MessagePort | null = null;
    private messageHandler: (event: MessageEvent) => void;
    public onRecievedMessage: (event: MessageEvent) => void;

    constructor(onRecievedMessage?: any) {
        this.messageHandler = (event: MessageEvent) => this.setupMessageEvents(event);
        window.addEventListener("message", this.messageHandler);

        // Set the default handler or use the one passed in
        this.onRecievedMessage = onRecievedMessage || this.defaultMessageHandler.bind(this);

        // Signal to parent that frame is ready (handles both initial load and reloads)
        if (window.parent !== window) {
            window.parent.postMessage({ type: 'FRAME_READY' }, window.location.origin);
        }
    }

    setupMessageEvents(event: MessageEvent) {
        if (event.origin !== window.location.origin) {
            logger.error("Origin mismatch:", event.origin, "vs", window.location.origin);
            return;
        }

        if (event.data.action === "Host:Create") {
            logger.log("Channel connected");

            if (!event.ports || event.ports.length === 0) {
                logger.error("No ports received!");
                return;
            }

            this.channel = event.ports[0];
            this.channel.onmessage = (event: MessageEvent) => this.onRecievedMessage(event);
            this.channel.start();
        }
    }

    /**
     * Fallback if the FrameChannel implementation doesnt include custom `onRecievedMessage` handler
     * @param event
     */
    private defaultMessageHandler(event: MessageEvent) {
        logger.log('Message called doing nothing', event);

    }

}
