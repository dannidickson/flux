import HostChannel from "../channels/HostChannel";
import { logger } from "../core/logger";
import FluxDirectiveManager from "./FluxDirectiveManager";
import FluxLiveState from "./FluxLiveState";

const API_ENDPOINT = "/flux/api";
const CMS_FRAME = 'iframe[name="cms-preview-iframe"]';
const PAGE_COOLDOWN_MS = 500;
const BLOCK_COOLDOWN_MS = 500;

function createCooldown(ms: number) {
    const last = new Map<string, number>();
    return (key = "default") => {
        const now = Date.now();
        if (now - (last.get(key) ?? 0) < ms) return false;
        last.set(key, now);
        return true;
    };
}

export default class FluxHostCoordinator {
    private hostChannel: HostChannel;
    private fluxState: FluxLiveState;
    private readonly pageReady = createCooldown(PAGE_COOLDOWN_MS);
    private readonly blockReady = createCooldown(BLOCK_COOLDOWN_MS);
    private observers: MutationObserver[] = [];
    private suppressModalUpdate: boolean = false;

    constructor(
        private url: string,
        private $: any,
    ) {
        this.hostChannel = new HostChannel(url, CMS_FRAME);
        this.fluxState = new FluxLiveState();
    }

    initialize(): void {
        this.setupIframeListeners();
        this.setupSplitModeObserver();
        this.setupModalObserver();

        this.setupFluxBindings();
    }

    private setupIframeListeners(): void {
        this.hostChannel.setOnFrameReady(() => {
            this.sendFluxConfigToIframe();

            if (Object.keys(this.fluxState.getChangeSet()).length > 0) {
                this.sendPageTemplateUpdate();
            }
        });
    }

    private sendFluxConfigToIframe(): void {
        if ((window as any).FluxConfig) {
            this.hostChannel.broadcastMessage({
                type: "configUpdate",
                config: (window as any).FluxConfig,
            });
        }
    }

    private observeClassAttribute(
        element: Element,
        callback: (el: HTMLElement) => void,
    ): MutationObserver {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.attributeName === "class") {
                    callback(mutation.target as HTMLElement);
                }
            });
        });
        observer.observe(element, {
            attributes: true,
            attributeFilter: ["class"],
        });
        return observer;
    }

    private setupSplitModeObserver(): void {
        const cmsContainer = document.querySelector(".cms-container");
        if (!cmsContainer) return;

        let wasSplitMode = cmsContainer.classList.contains(
            "cms-container--split-mode",
        );

        if (wasSplitMode) {
            this.fluxState.setLiveStateActive(true);
        }

        const observer = this.observeClassAttribute(cmsContainer, (target) => {
            const isSplitMode = target.classList.contains(
                "cms-container--split-mode",
            );

            if (isSplitMode && !wasSplitMode) {
                this.fluxState.setLiveStateActive(true);
                this.sendFluxConfigToIframe();
                if (Object.keys(this.fluxState.getChangeSet()).length > 0) {
                    this.sendPageTemplateUpdate();
                }
            } else if (!isSplitMode && wasSplitMode) {
                this.fluxState.setLiveStateActive(false);
            }

            wasSplitMode = isSplitMode;
        });

        this.observers.push(observer);
    }

    private setupModalObserver(): void {
        const bodyElement = document.body;
        if (!bodyElement) return;

        const observer = this.observeClassAttribute(bodyElement, (target) => {
            if (target.classList.contains("modal-open")) {
                logger.log("Modal opened");
            } else {
                window.setTimeout(() => {
                    if (this.suppressModalUpdate) {
                        logger.log("Modal closed — skipping update (TinyMCE handled)");
                        this.suppressModalUpdate = false;
                        return;
                    }
                    logger.log("Modal closed");
                    this.sendPageTemplateUpdate();
                }, 500);
            }
        });

        this.observers.push(observer);
    }

    async sendPageTemplateUpdate(): Promise<any> {
        if (!this.pageReady()) {
            logger.log("Still in cooldown, skipping update");
            return;
        }

        try {
            const response = await this.fluxState.sendUpdate(API_ENDPOINT);

            if (!response.trusted) {
                logger.warn("Source HTML returned unsafe html");
            }

            this.hostChannel.broadcastMessage({
                type: "pageTemplateUpdate",
                html: response.html,
                changedFields: response.changedFields,
            });

            if (response.segmentTemplateChanges) {
                const { Elements } = response.segmentTemplateChanges;

                Object.entries(Elements).forEach(([id, html]) => {
                    this.hostChannel.broadcastMessage({
                        type: "blockUpdate",
                        html,
                        targetOwner: `#e${id}`,
                    });
                });
            }

            return response;
        } catch (error) {
            logger.error("Template update failed:", error);
            throw error;
        }
    }

    async sendBlockUpdate(owner: string): Promise<any> {
        if (!this.blockReady(owner)) {
            logger.log(`Block cooldown active for ${owner}, skipping`);
            return;
        }

        try {
            const response = await this.fluxState.sendBlockUpdate(
                API_ENDPOINT,
                owner,
            );

            if (!response.trusted) {
                logger.warn("Block update returned unsafe html");
            }

            logger.log(`Morphing block: ${owner}`);

            this.hostChannel.broadcastMessage({
                type: "blockUpdate",
                html: response.html,
                targetOwner: owner,
            });

            return response;
        } catch (error) {
            logger.warn(
                "Block update failed, falling back to full page update:",
                error,
            );
            this.sendPageTemplateUpdate();
        }
    }

    triggerUpdate(owner: string | null): void {
        if (!this.fluxState.getIsActive()) return;

        if (owner) {
            this.sendBlockUpdate(owner);
        } else {
            this.sendPageTemplateUpdate();
        }
    }

    async sendPatchUpdate(key: string, value: string, owner: string | null): Promise<void> {
        if (!this.fluxState.getIsActive()) return;

        this.suppressModalUpdate = true;

        try {
            const response = await fetch(`${API_ENDPOINT}/shortCodesFragmentPatch`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ key, value, owner }),
            });

            if (!response.ok) {
                throw new Error(`Patch update failed: ${response.statusText}`);
            }

            const data = await response.json();

            this.hostChannel.broadcastMessage({
                type: "patchTemplateUpdate",
                key: data.key,
                owner: data.owner,
                value: data.html,
            });
        } catch (error) {
            logger.warn("Patch update failed, falling back to full update:", error);
            this.triggerUpdate(owner);
        }
    }

    private setupFluxBindings(): void {
        const bindingManager = new FluxDirectiveManager(
            this.$,
            this.fluxState,
            (owner) => this.triggerUpdate(owner),
            this.hostChannel,
            (key, value, owner) => this.sendPatchUpdate(key, value, owner),
        );

        bindingManager.initialize();
    }

    destroy(): void {
        this.observers.forEach((observer) => observer.disconnect());
        this.observers = [];
        this.hostChannel.destroy();
    }
}
