import HostChannel from "../channels/HostChannel";
import { logger } from "../core/logger";
import type { FluxChunkedSaveResponse, FluxCmsMode, JQueryElement } from "../types/flux.interface";
import FluxApiClient from "./FluxApiClient";
import { applyPjaxBootstrapFromDom, currentContextHint } from "./FluxBootstrap";
import FluxDirectiveManager from "./directives/FluxDirectiveManager";
import FluxLiveState from "./FluxLiveState";

const API_ENDPOINT = "/flux";
const CMS_FRAME = 'iframe[name="cms-preview-iframe"]';
const PAGE_COOLDOWN_MS = 500;
const BLOCK_COOLDOWN_MS = 500;

/**
 * Elemental saves and publishes a single block through its own JSON API from
 * React, so those writes never reach entwine's `aftersubmitform` or jQuery's
 * `ajaxComplete` — watching fetch is the only hook that sees them.
 */
const BLOCK_SAVE_URL = /\/elemental-area\/api\/(saveForm|publish|unpublish)\b/;

/**
 * Which block a save was for. `saveForm` carries the id in the path
 * (`POST api/saveForm/$ID`); publish and unpublish carry it in the JSON body.
 * Returns null when neither says — the caller must not guess.
 */
function blockIdFromSave(url: string, init?: RequestInit): string | null {
    const fromPath = url.match(/\/api\/saveForm\/(\d+)/);
    if (fromPath) {
        return fromPath[1];
    }

    const body = init?.body;
    if (typeof body !== "string") {
        return null;
    }

    try {
        const id = JSON.parse(body)?.id;
        return id === undefined || id === null ? null : String(id);
    } catch {
        return null;
    }
}

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

/**
 * The CMS posts its edit form with `X-Pjax: CurrentForm,Breadcrumbs,ValidationResult`,
 * so the response body is a fragment map whose ValidationResult entry wraps
 * `{ isValid, messages }` in a `<script type="application/json">` tag (see
 * RequestHandler::prepareDataForPjax).
 *
 * Only a definite failure counts: a response we can't classify is treated as a
 * successful save, which is the same assumption the CMS makes of it.
 */
function validationFailed(xhr?: XMLHttpRequest): boolean {
    const body = xhr?.responseText;
    if (!body) return false;

    try {
        const fragment = JSON.parse(body)?.ValidationResult;
        if (typeof fragment !== "string") return false;

        const script = new DOMParser()
            .parseFromString(fragment, "text/html")
            .querySelector('script[type="application/json"]');

        return script?.textContent
            ? JSON.parse(script.textContent).isValid === false
            : false;
    } catch {
        return false;
    }
}

export default class FluxHostCoordinator {
    private hostChannel: HostChannel;
    private fluxState: FluxLiveState;
    private api: FluxApiClient;
    private readonly pageReady = createCooldownGate(PAGE_COOLDOWN_MS);
    private readonly blockReady = createCooldownGate(BLOCK_COOLDOWN_MS);
    private observers: MutationObserver[] = [];
    private suppressModalUpdate = false;
    private unwatchSaves: (() => void) | null = null;

    constructor(
        url: string,
        private $: JQueryElement,
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
        this.setupSaveHandlers();

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

        let modalOpen = bodyElement.classList.contains("modal-open");

        const observer = this.observeClassAttribute(bodyElement, (target) => {
            const isOpen = target.classList.contains("modal-open");
            if (isOpen === modalOpen) return;
            modalOpen = isOpen;

            if (isOpen) {
                logger.log("Modal opened");
                return;
            }

            window.setTimeout(() => {
                if (!this.fluxState.getIsActive()) {
                    logger.log("Modal closed — no live preview, skipping update");
                    return;
                }

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

            if (response.spliceMisses?.length) {
                logger.error(
                    "Element regions not found. May stale content for:",
                    response.spliceMisses,
                );
            }

            if (response.segmentTemplateChanges) {
                const { Elements } = response.segmentTemplateChanges;
                for (const [id, fragment] of Object.entries(Elements)) {
                    if (!fragment.owner) {
                        logger.error(
                            `Element ${id} has no owner target; skipping block`,
                        );
                        continue;
                    }
                    this.hostChannel.broadcastMessage({
                        type: "blockUpdate",
                        html: fragment.html,
                        targetOwner: fragment.owner,
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
    async saveChunked(): Promise<FluxChunkedSaveResponse> {
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

    /**
     * A save makes the database authoritative for the record being edited, so
     * the changes we recorded on the way there have to go.
     *
     * The preview iframe reloads immediately afterwards — silverstripe/admin's
     * own `onaftersubmitform` calls `_initialiseFromContent()`, and elemental
     * refreshes the preview after a block write — and the FRAME_READY that
     * follows would otherwise replay the ChangeSet over the freshly saved
     * render, reverting the preview to whatever we last captured. For a rich
     * text field that is several keystrokes behind what was actually written.
     *
     * Letting the reload stand rather than pushing a render of our own also
     * keeps the preview on whichever stage the CMS is previewing;
     * /flux/pageTemplateUpdate always renders Draft.
     */
    private setupSaveHandlers(): void {
        const coordinator = this;

        // Page and GridField detail forms submit through entwine.
        this.$.entwine("flux", function ($: any) {
            $(".cms-edit-form").entwine({
                onaftersubmitform: function (this: any, event: any, data: any) {
                    coordinator.handleRecordSaved("form submit", data?.xhr);
                    this._super(event, data);
                },
            });
        });

        this.watchBlockSaves();
    }

    /**
     * Elemental's block save / publish / unpublish go out as fetch calls from
     * React, so we watch fetch itself. Responses are only inspected, never
     * read — consuming the body here would starve the real caller.
     */
    private watchBlockSaves(): void {
        if (this.unwatchSaves) return;

        const originalFetch = window.fetch;
        if (!originalFetch) return;

        // Chrome throws "Illegal invocation" on a fetch called off the window.
        const callOriginal = originalFetch.bind(window);

        window.fetch = async (...args: Parameters<typeof fetch>) => {
            const response = await callOriginal(...args);

            try {
                const [resource] = args;
                const url =
                    typeof resource === "string"
                        ? resource
                        : resource instanceof Request
                          ? resource.url
                          : String(resource);

                if (response.ok && BLOCK_SAVE_URL.test(url)) {
                    this.handleBlockSaved(url, args[1]);
                }
            } catch (error) {
                logger.error(
                    "Could not tell whether a fetch was a block save — stale changes may be replayed over it:",
                    error,
                );
            }

            return response;
        };

        this.unwatchSaves = () => {
            window.fetch = originalFetch;
        };
    }

    private handleRecordSaved(source: string, xhr?: XMLHttpRequest): void {
        if (validationFailed(xhr)) {
            logger.warn(
                `Save (${source}) failed validation — keeping recorded changes so the preview still shows them`,
            );
            return;
        }

        const dropped = this.fluxState.clear();
        if (!dropped.length) return;

        logger.log(
            `Saved (${source}) — dropped recorded changes, the preview reload renders from the database:`,
            dropped,
        );
    }

    /**
     * A block write makes the database authoritative for that block alone. The
     * page's own pending edits, and every other block's, are still unsaved and
     * must survive — dropping them here would silently discard work the user
     * can still see in the preview.
     */
    private handleBlockSaved(url: string, init?: RequestInit): void {
        const elementId = blockIdFromSave(url, init);

        if (elementId === null) {
            logger.error(
                `Block write to ${url} did not identify its element — keeping all recorded changes, ` +
                    'so the preview may replay a stale value over the saved one.',
            );
            return;
        }

        const dropped = this.fluxState.clearRecord("Element", elementId);
        if (!dropped.length) return;

        logger.log(
            `Block ${elementId} saved — dropped its recorded changes, the rest of the page keeps its own:`,
            dropped,
        );
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
        this.unwatchSaves?.();
        this.unwatchSaves = null;
        this.hostChannel.destroy();
    }
}
