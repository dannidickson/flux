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
async function sendTemplateUpdate(hostChannel: any, fluxState: FluxLiveState) {
    return fluxState.sendUpdate(API_ENDPOINT)
        .then((response) => {
            if (!response.trusted) {
                console.warn("Source HTML returned unsafe html");
            }

            // Broadcast the HTML to the iframe for live updates
            hostChannel.broadcastMessage({
                type: 'templateUpdate',
                html: response.html,
                changedFields: response.changedFields
            });

            return response;
        })
        .catch((error) => {
            console.error("Template update failed:", error);
            throw error;
        });
}

window.addEventListener("load", function () {
    const $ = window.jQuery;
    const entwine = $.entwine;
    const fluxState = new FluxLiveState();

    const url = window.location.origin;

    const hostChannel = new HostChannel(url, CMS_FRAME);

    // Watch for split mode changes
    const cmsContainer = document.querySelector('.cms-container');
    if (cmsContainer) {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    let target = mutation.target as HTMLElement;
                    if (target.classList.contains('cms-container--split-mode')) {
                        fluxState.setLiveStateActive(true);
                        sendTemplateUpdate(hostChannel, fluxState);
                    }
                    else {
                        fluxState.setLiveStateActive(false);
                    }
                }
            });
        });

        observer.observe(cmsContainer, {
            attributes: true,
            attributeFilter: ['class']
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

                // Watch for file upload / react dropdown changes
                if (proxyElement) {
                    const proxyElementType = element.getAttribute("fx-proxy-type");

                    switch (proxyElementType) {
                        case "document":
                            element = document.querySelector(proxyElement);
                            break;
                        case "previousElementSibling":
                            element = element.previousElementSibling;
                            break;
                    }

                    let previousValue = null;
                    let isFirstRun = true;

                    const observer = new MutationObserver((mutations) => {
                        const proxiedElement = element.querySelector(proxyElement);

                        if (!proxiedElement) {
                            return;
                        }

                        const currentValue = proxiedElement.value || proxiedElement.getAttribute('value') || '';

                        if (isFirstRun) {
                            previousValue = currentValue;
                            isFirstRun = false;
                            return;
                        }

                        if (currentValue !== previousValue) {
                            previousValue = currentValue;
                            fluxState.updateField(bindKey, currentValue);
                            sendTemplateUpdate(hostChannel, fluxState);
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

                element.addEventListener(bindEvent, (listenerEvent) => {
                    let event, value, type;

                    if (bindEvent === "keyup") {
                        value = listenerEvent.target.value;
                        type = 'Text';
                    }

                    if (bindEvent === "click") {
                        value = listenerEvent.target.checked;
                        type = 'HTML';
                    }

                    if (bindEvent === "change") {
                        value = listenerEvent.target.value || listenerEvent.target.checked;
                        type = 'HTML';
                    }

                    fluxState.updateField(bindKey, value);
                    if (!fluxState.getIsActive()) {
                        return;
                    }

                    if (type === 'Text') {
                        hostChannel.broadcastMessage({
                            type: 'textUpdate',
                            key: bindKey,
                            event: bindEvent,
                            value
                        });
                        return;
                    }

                    sendTemplateUpdate(hostChannel, fluxState);
                });
            },
        });
    });

});
