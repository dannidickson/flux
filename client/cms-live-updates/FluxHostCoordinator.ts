import HostChannel from "../channels/HostChannel";
import { logger } from "../core/logger";
import type { FluxCmsMode } from "../types/flux.interface";
import FluxApiClient from "./FluxApiClient";
import { applyPjaxBootstrapFromDom, currentContextHint } from "./FluxBootstrap";
import FluxDirectiveManager from "./directives/FluxDirectiveManager";
import FluxLiveState from "./FluxLiveState";

const API_ENDPOINT = "/flux";
const CMS_FRAME = 'iframe[name="cms-preview-iframe"]';
const PAGE_COOLDOWN_MS = 500;
const BLOCK_COOLDOWN_MS = 500;

/**
 * Returns a predicate that reports whether a given key has "cooled down" since
 * its last allowed call. Calling the predicate updates the last-call time.
 */
function createCooldownGate(ms: number) {
    const lastCalled = new Map<string, number>();
    return (key = "default") => {
        const now = Date.now();
        if (now - (lastCalled.get(key) ?? 0) < ms) return false;
        lastCalled.set(key, now);
        return true;
    };
}

export default class FluxHostCoordinator {
    private hostChannel: HostChannel;
    private fluxState: FluxLiveState;
    private api: FluxApiClient;
    private readonly pageReady = createCooldownGate(PAGE_COOLDOWN_MS);
    private readonly blockReady = createCooldownGate(BLOCK_COOLDOWN_MS);
    private observers: MutationObserver[] = [];
    private suppressModalUpdate = false;

    constructor(
        url: string,
        private $: any,
    ) {
        this.hostChannel = new HostChannel(url, CMS_FRAME);
        this.fluxState = new FluxLiveState();
        this.api = new FluxApiClient(API_ENDPOINT);
    }

    initialize(): void {
        this.setupFrameReadyHandler();
        this.setupSplitModeObserver();
        this.setupModalObserver();
        this.setupFluxBindings();
        this.setupPjaxHandler();

        // The frame may have loaded (and posted FRAME_READY) before this host
        // existed — e.g. on a direct refresh, where window.load fires after the
        // iframe. Connect to it now so we don't sit on a dead channel.
        this.hostChannel.connectExistingFrame();
    }

    private currentMode(): FluxCmsMode {
        const cmsContainer = document.querySelector(".cms-container");
        if (!cmsContainer) {
            return "edit";
        }

        if (cmsContainer.classList.contains("cms-container--preview-mode")) {
            return "preview";
        }
        if (cmsContainer.classList.contains("cms-container--split-mode")) {
            return "split";
        }

        return "edit";
    }

    private broadcastMode(): void {
        this.hostChannel.broadcastMessage({
            type: "modeChange",
            mode: this.currentMode(),
        });
    }

    private setupFrameReadyHandler(): void {
        this.hostChannel.setOnFrameReady(() => {
            this.sendContextHintToIframe();
            this.broadcastMode();
            this.sendPageUpdateIfChanged();
        });
    }

    /**
     * Provides a hint to the frame what the active record is, its relation
     * This can then be used to fetch additional information based on its scope and state
     */
    private sendContextHintToIframe(): void {
        const hint = currentContextHint();
        if (!hint) {
            logger.warn("No context hint available to send to iframe");
            return;
        }
        this.hostChannel.broadcastMessage({
            type: "contextHint",
            class: hint.class,
            id: hint.id,
            itemID: hint.itemID ?? null,
            relation: hint.relation ?? null,
        });
    }

    private sendPageUpdateIfChanged(): void {
        if (this.fluxState.hasChanges()) {
            this.sendPageTemplateUpdate();
        }
    }

    private sendFluxConfigToIframe(): void {
        if (window.FluxConfig) {
            this.hostChannel.broadcastMessage({
                type: "configUpdate",
                config: window.FluxConfig,
            });
        }
    }

    private observeClassAttribute(
        element: Element,
        callback: (el: HTMLElement) => void,
    ): MutationObserver {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                callback(mutation.target as HTMLElement);
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

        let lastMode = this.currentMode();
        this.fluxState.setLiveStateActive(lastMode !== "edit");

        const observer = this.observeClassAttribute(cmsContainer, () => {
            const mode = this.currentMode();
            if (mode === lastMode) return;

            /**
             * Because we are keeping the changes, when switching to a mode with "preview"
             * We apply the config and draft state to match
             */
            if (lastMode === "edit" && mode !== "edit") {
                this.fluxState.setLiveStateActive(true);
                this.sendFluxConfigToIframe();
                this.sendPageUpdateIfChanged();
            } else if (mode === "edit") {
                this.fluxState.setLiveStateActive(false);
            }

            lastMode = mode;
            this.broadcastMode();
        });

        this.observers.push(observer);
    }

    /**
     * A workaround for Modals, when a model is closed we treat these as a 'templateUpdate' event
     * So that if we have a Link / Image etc. Its re-rendered in the preview panel
     * @returns
     */
    private setupModalObserver(): void {
        const bodyElement = document.body;
        if (!bodyElement) return;

        const observer = this.observeClassAttribute(bodyElement, (target) => {
            if (target.classList.contains("modal-open")) {
                logger.log("Modal opened");
                return;
            }

            window.setTimeout(() => {
                if (this.suppressModalUpdate) {
                    logger.log(
                        "Modal closed — skipping update (TinyMCE handled)",
                    );
                    this.suppressModalUpdate = false;
                    return;
                }
                logger.log("Modal closed");
                this.sendPageTemplateUpdate();
            }, 500);
        });

        this.observers.push(observer);
    }

    async sendPageTemplateUpdate(): Promise<void> {
        if (!this.pageReady()) {
            logger.log("Still in cooldown, skipping update");
            return;
        }

        try {
            const payload = this.fluxState.toPageUpdatePayload();
            const response = await this.api.sendPageUpdate(payload);

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
                for (const [id, html] of Object.entries(Elements)) {
                    this.hostChannel.broadcastMessage({
                        type: "blockUpdate",
                        html,
                        targetOwner: `#e${id}`,
                    });
                }
            }
        } catch (error) {
            logger.error("Template update failed:", error);
            throw error;
        }
    }

    async sendBlockUpdate(owner: string): Promise<void> {
        if (!this.blockReady(owner)) {
            logger.log(`Block cooldown active for ${owner}, skipping`);
            return;
        }

        try {
            const payload = this.fluxState.toBlockUpdatePayload(owner);
            const response = await this.api.sendBlockUpdate(payload, owner);

            if (!response.trusted) {
                logger.warn("Block update returned unsafe html");
            }

            logger.log(`Morphing block: ${owner}`);
            this.hostChannel.broadcastMessage({
                type: "blockUpdate",
                html: response.html,
                targetOwner: owner,
            });
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
            return;
        }

        this.sendPageTemplateUpdate();
    }

    /**
     * Part of the 'Inline' preview ui work.
     * Sends all the draft state and will iterate through the blocks and save them in a single transaction.
     *
     * @TODO not yet final
     */
    async saveChunked(): Promise<{
        ok: boolean;
        saved: Array<any>;
        errors: Array<any>;
    }> {
        const payload = this.fluxState.getChunkedSavePayload();
        if (payload.chunks.length === 0) {
            return {
                ok: true,
                saved: [],
                errors: []
            };
        }

        const result = await this.api.sendChunkedSave(payload);

        if (result.ok) {
            this.fluxState.clear();
            this.sendPageTemplateUpdate();
            return result;
        }

        logger.warn("Chunked save failed:", result.errors);
        return result;
    }

    async sendPatchUpdate(
        key: string,
        value: string,
        owner: string | null,
    ): Promise<void> {
        if (!this.fluxState.getIsActive()) return;

        this.suppressModalUpdate = true;

        try {
            const data = await this.api.sendPatchUpdate(key, value, owner);

            this.hostChannel.broadcastMessage({
                type: "patchTemplateUpdate",
                key: data.key,
                owner: data.owner,
                value: data.html,
            });
        } catch (error) {
            logger.warn(
                "Patch update failed, falling back to full update:",
                error,
            );
            this.triggerUpdate(owner);
        }
    }

    /**
     * Wait so the swapped html contains the new script so we can apply the bootstrapping information
     */
    private setupPjaxHandler(): void {
        this.$(document).on("ajaxComplete", () => {
            requestAnimationFrame(() => {
                if (!applyPjaxBootstrapFromDom()) return;
                this.sendContextHintToIframe();
            });
        });
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
