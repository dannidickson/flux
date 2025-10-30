import { logger } from "../core/logger";

export default class HostChannel {
    channelType: string;
    channelInstance: MessageChannel;
    frame: Element | null;


    constructor(url: string, frameElement: string) {
        this.channelType = "MessageChannel";

        this.frame = document.querySelector(frameElement);

        if (this.frame === null) {
            throw new Error(`iFrame cannot be found using ${frameElement}`);
        }

        this.channelInstance = new MessageChannel();

        this.channelInstance.port1.onmessage = (event: MessageEvent) =>
            this.recieveMessageFromFrame(event);
        this.channelInstance.port1.onmessageerror = (event: Event) => { };

        this.channelInstance.port1.start();

        // Listen for FRAME_READY signal from iframe
        const readyHandler = (event: MessageEvent) => {
            if (event.data.type === 'FRAME_READY') {
                logger.log("Frame ready - establishing channel");
                window.removeEventListener('message', readyHandler);
                this.sendPortToFrame();
            }
        };
        window.addEventListener('message', readyHandler);
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
}
