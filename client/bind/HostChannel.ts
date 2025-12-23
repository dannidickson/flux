import { logger } from "../core/logger";

export default class HostChannel {
    channelType: string;
    channelInstance!: MessageChannel;
    frame: Element | null;
    private readyHandler: (event: MessageEvent) => void;


    constructor(url: string, frameElement: string) {
        this.channelType = "MessageChannel";

        this.frame = document.querySelector(frameElement);

        if (this.frame === null) {
            throw new Error(`iFrame cannot be found using ${frameElement}`);
        }

        this.createChannel();

        // Listen for FRAME_READY signal from iframe (including reloads)
        this.readyHandler = (event: MessageEvent) => {
            if (event.data.type === 'FRAME_READY' && event.origin === window.location.origin) {
                logger.log("Frame ready - establishing channel");
                this.recreateChannel();
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

        // Close old channel
        if (this.channelInstance) {
            this.channelInstance.port1.close();
        }

        // Create new channel
        this.createChannel();

        // Send new port to iframe
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

    recieveMessageFromFrame(event: Event) {

    }

    recieveMessageError(event: Event) {
        logger.error("HostChannel reports error from FrameChannel:", event);
    }

    broadcastMessage(broadcastMessage: any) {
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
