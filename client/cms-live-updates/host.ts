// @ts-nocheck
/* eslint-disable */
import HostChannel from "../bind/HostChannel";
import { logger } from "../core/logger";
import FluxLiveState from "./FluxLiveState";

const API_ENDPOINT = "/flux/api";
const CMS_FRAME = 'iframe[name="cms-preview-iframe"]';

/**
 * Sends the HTML down to the frame
 * @param hostChannel
 * @param fluxState
 * @returns
 */
let lastCallTime = 0;

/**
 * Should probably consider doing this via a queue system
 * This way I can tell which updates can be skipped, or if it requires a template update
 * We need to consider this as we are listening to modal open and close, when the close is triggered
 * it fires this update, but might not require any changes.
 *
 * @param hostChannel
 * @param fluxState
 * @param cooldownMs
 * @returns
 */
async function sendPageTemplateUpdate(
    hostChannel: any,
    fluxState: FluxLiveState,
    cooldownMs: number = 500,
) {
    const now = Date.now();
    if (now - lastCallTime < cooldownMs) {
        logger.log("Still in cooldown, skipping update");
        return; // Skip this call
    }
    lastCallTime = now;

    // Execute immediately
    try {
        const response = await fluxState.sendUpdate(API_ENDPOINT);

        if (!response.trusted) {
            console.warn("Source HTML returned unsafe html");
        }

        hostChannel.broadcastMessage({
            type: "pageTemplateUpdate",
            html: response.html,
            changedFields: response.changedFields,
        });

        return response;
    } catch (error) {
        console.error("Template update failed:", error);
        throw error;
    }
}

const blockCooldowns: Map<string, number> = new Map();

async function sendBlockUpdate(
    hostChannel: any,
    fluxState: FluxLiveState,
    owner: string,
    cooldownMs: number = 500,
) {
    const now = Date.now();
    const lastCall = blockCooldowns.get(owner) || 0;
    if (now - lastCall < cooldownMs) {
        logger.log(`Block cooldown active for ${owner}, skipping`);
        return;
    }
    blockCooldowns.set(owner, now);

    try {
        const response = await fluxState.sendBlockUpdate(API_ENDPOINT, owner);

        if (!response.trusted) {
            console.warn("Block update returned unsafe html");
        }

        console.log(`Morphing block: ${owner}`);

        hostChannel.broadcastMessage({
            type: "blockUpdate",
            html: response.html,
            targetOwner: owner,
        });

        return response;
    } catch (error) {
        console.warn("Block update failed, falling back to full page update:", error);
        sendPageTemplateUpdate(hostChannel, fluxState);
    }
}

window.addEventListener("load", function () {
    const $ = window.jQuery;
    const entwine = $.entwine;
    const fluxState = new FluxLiveState();

    const url = window.location.origin;

    const hostChannel = new HostChannel(url, CMS_FRAME);

    // Send FluxConfig to iframe when it loads
    const sendFluxConfigToIframe = () => {
        if ((window as any).FluxConfig) {
            hostChannel.broadcastMessage({
                type: "configUpdate",
                config: (window as any).FluxConfig,
            });
        }
    };

    // Send config when iframe loads
    const iframe = document.querySelector(CMS_FRAME) as HTMLIFrameElement;
    if (iframe) {
        iframe.addEventListener("load", sendFluxConfigToIframe);
    }

    // Watch for split mode changes
    const cmsContainer = document.querySelector(".cms-container");
    if (cmsContainer) {
        // Track previous split mode state to detect transitions
        let wasSplitMode = cmsContainer.classList.contains(
            "cms-container--split-mode",
        );

        // Set initial state without triggering update
        if (wasSplitMode) {
            fluxState.setLiveStateActive(true);
        }

        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (
                    mutation.type === "attributes" &&
                    mutation.attributeName === "class"
                ) {
                    let target = mutation.target as HTMLElement;
                    const isSplitMode = target.classList.contains(
                        "cms-container--split-mode",
                    );

                    // Only trigger update when transitioning TO split mode, not when already in it
                    if (isSplitMode && !wasSplitMode) {
                        fluxState.setLiveStateActive(true);
                        // Send config to iframe when entering split mode
                        sendFluxConfigToIframe();
                        // Only send template update if there are field changes
                        if (
                            fluxState.getChangedFields() &&
                            Object.keys(fluxState.getChangedFields()).length > 0
                        ) {
                            sendPageTemplateUpdate(hostChannel, fluxState);
                        }
                    } else if (!isSplitMode && wasSplitMode) {
                        fluxState.setLiveStateActive(false);
                    }

                    wasSplitMode = isSplitMode;
                }
            });
        });

        observer.observe(cmsContainer, {
            attributes: true,
            attributeFilter: ["class"],
        });
    }

    // Watch for modal-open class on body element
    const bodyElement = document.body;
    if (bodyElement) {
        const bodyObserver = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (
                    mutation.type === "attributes" &&
                    mutation.attributeName === "class"
                ) {
                    const hasModalOpen =
                        bodyElement.classList.contains("modal-open");

                    if (hasModalOpen) {
                        console.log("Modal opened");
                        console.log(fluxState);
                    } else {
                        this.setTimeout(() => {
                            console.log("Modal closed");
                            sendPageTemplateUpdate(hostChannel, fluxState);
                        }, 500);
                    }
                }
            });
        });

        bodyObserver.observe(bodyElement, {
            attributes: true,
            attributeFilter: ["class"],
        });
    }

    entwine("flux", function ($) {
        $("[fx-key]").entwine({
            onmatch: function (event) {
                var self = $(this);
                let element = self[0];

                const bindKey = element.getAttribute("fx-key");
                const bindEvent = element.getAttribute("fx-event");
                const proxyElement = element.getAttribute("fx-proxy");
                const owner = element.getAttribute("fx-owner") ?? null;
                const type = element.getAttribute("fx-type") ?? null;

                // Watch for file upload / react dropdown changes
                if (proxyElement) {
                    const proxyElementType =
                        element.getAttribute("fx-proxy-type");

                    switch (proxyElementType) {
                        case "document":
                            element = document.querySelector(proxyElement);
                            break;
                        case "previousElementSibling":
                            element = element.previousElementSibling;
                            break;
                        case "default":
                        case "element":
                        case "self":
                        default:
                            element = element.querySelector(proxyElement);
                            break;
                    }

                    let previousValue = null;
                    let isFirstRun = true;

                    const observer = new MutationObserver((mutations) => {
                        const proxiedElement =
                            element.querySelector(proxyElement);

                        if (!proxiedElement) {
                            return;
                        }

                        const currentValue =
                            proxiedElement.value ||
                            proxiedElement.getAttribute("value") ||
                            "";

                        if (isFirstRun) {
                            previousValue = currentValue;
                            isFirstRun = false;
                            return;
                        }

                        if (currentValue !== previousValue) {
                            previousValue = currentValue;
                            fluxState.updateField(bindKey, currentValue, {
                                owner: owner,
                            });
                            owner
                                ? sendBlockUpdate(hostChannel, fluxState, owner)
                                : sendPageTemplateUpdate(hostChannel, fluxState);
                        }
                    });

                    observer.observe(element, {
                        attributes: true,
                        attributeFilter: ["value"],
                        childList: true,
                        subtree: true,
                        characterData: false,
                    });

                    return;
                }

                if (!element) return;

                if (element.tagName === "TEXTAREA" && type === "HTML") {
                    var editor = tinymce.get(element.id);

                    if (editor) {
                        editor.on("keyup", function () {
                            document
                                .querySelector(".flux-refresh__button")
                                .classList.toggle("hidden", false);
                            // @TODO this is a good case for a 'patchUpdate'
                            // where instead of generating the entire HTML, it sends a patch to the specific binding key
                            // This would handle
                            hostChannel.broadcastMessage({
                                type: "textUpdate",
                                key: bindKey,
                                owner: owner,
                                event: bindEvent,
                                value: editor.getContent(),
                            });
                        });
                    }
                }

                element.addEventListener(bindEvent, (listenerEvent) => {
                    let event, value, type;

                    if (bindEvent === "keyup") {
                        value = listenerEvent.target.value;
                        if (
                            element.getAttribute("fx-event-type") ===
                            "templateUpdate"
                        ) {
                            type = "HTML";
                        } else if (value.length < 1) type = "HTML";
                        else type = "Text";
                    }

                    if (bindEvent === "click") {
                        value = listenerEvent.target.checked;
                        type = "HTML";
                    }

                    if (bindEvent === "change") {
                        value =
                            listenerEvent.target.value ||
                            listenerEvent.target.checked;
                        type = "HTML";
                    }

                    fluxState.updateField(bindKey, value, {
                        type: type,
                        owner: owner,
                    });
                    if (!fluxState.getIsActive()) {
                        return;
                    }

                    if (type === "Text") {
                        hostChannel.broadcastMessage({
                            type: "textUpdate",
                            key: bindKey,
                            owner: owner,
                            event: bindEvent,
                            value,
                        });
                        return;
                    }

                    if (owner) {
                        sendBlockUpdate(hostChannel, fluxState, owner);
                    }
                    else {
                        sendPageTemplateUpdate(hostChannel, fluxState);
                    }
                });
            },
        });

        $("[fx-proxy]").entwine({
            onmatch: function (event) {
                var self = $(this);
                let proxiedElement = self[0];
                console.log(proxiedElement);

                const parentElement = proxiedElement.closest("[fx-key]");

                const bindKey = parentElement.getAttribute("fx-key");
                const bindEvent = parentElement.getAttribute("fx-event");
                const proxyElement = parentElement.getAttribute("fx-proxy");
                const owner = parentElement.getAttribute("fx-owner") ?? null;
                const type = parentElement.getAttribute("fx-type") ?? null;


                const observer = new MutationObserver((mutations) => {
                    if (!proxiedElement) {
                        return;
                    }

                    const currentValue =
                        proxiedElement.value ||
                        proxiedElement.getAttribute("value") ||
                        "";

                    let previousValue = null;
                    let isFirstRun = false;

                    if (currentValue !== previousValue) {
                        previousValue = currentValue;
                        fluxState.updateField(bindKey, currentValue, {
                            owner: owner,
                        });
                        owner
                            ? sendBlockUpdate(hostChannel, fluxState, owner)
                            : sendPageTemplateUpdate(hostChannel, fluxState);
                    }
                });

                observer.observe(proxiedElement, {
                    attributes: true,
                    attributeFilter: ["value"],
                    childList: true,
                    subtree: true,
                    characterData: false,
                });
            },
        });

        $(".flux-refresh__button").entwine({
            onclick: function (event) {
                var self = $(this);
                let element = self[0];

                sendPageTemplateUpdate(hostChannel, fluxState);
                element.classList.toggle("hidden", true);
            },
        });
    });
});
