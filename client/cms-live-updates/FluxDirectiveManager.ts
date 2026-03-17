import HostChannel from "../channels/HostChannel";
import { logger } from "../core/logger";
import FluxLiveState from "./FluxLiveState";
import { fromElement, getElementValue, type FluxDirective } from "../core/FluxDirective";

export default class FluxDirectiveManager {
    constructor(
        private $: any,
        private fluxState: FluxLiveState,
        private onTriggerUpdate: (owner: string | null) => void,
        private hostChannel: HostChannel,
    ) {}

    initialize(): void {
        const manager = this;
        this.$.entwine("flux", function ($: any) {
            manager.setupKeyBindings($);
            manager.setupRefreshButton($);
        });
    }

    private setupKeyBindings($: any): void {
        const manager = this;

        $("[fx-key]").entwine({
            onmatch: function (this: any, _event: any) {
                const element: HTMLElement = this[0];
                const binding = fromElement(element);

                if (!binding) return;

                // Watch for file upload / react dropdown changes
                if (binding.proxySelector) {
                    manager.observeKeyProxyElement(element, binding);
                    return;
                }

                if (element.tagName === "TEXTAREA" && binding.type === "HTML") {
                    manager.setupTinyMCEListener(element, binding);
                }

                element.addEventListener(binding.event as string, (listenerEvent: Event) => {
                    let value: any;
                    let type: string;

                    if (binding.collectSelector) {
                        value = Array.from(element.querySelectorAll(binding.collectSelector))
                            .map((el) => (el as HTMLInputElement).value);
                        type = "HTML";
                    } else {
                        ({ value, type } = manager.extractEventData(
                            listenerEvent,
                            binding.event,
                            element,
                        ));
                    }

                    manager.fluxState.updateField(binding.key, value, {
                        type,
                        owner: binding.owner ?? undefined,
                    });

                    if (!manager.fluxState.getIsActive()) return;

                    if (type === "Text") {
                        manager.hostChannel.broadcastMessage({
                            type: "textUpdate",
                            key: binding.key,
                            owner: binding.owner,
                            event: binding.event,
                            value,
                        });
                        return;
                    }

                    manager.onTriggerUpdate(binding.owner);
                });
            },
        });
    }

    private setupRefreshButton($: any): void {
        const manager = this;

        $(".flux-refresh__button").entwine({
            onclick: function (this: any, _event: any) {
                const element: HTMLElement = this[0];

                manager.onTriggerUpdate(null);
                element.classList.toggle("hidden", true);
            },
        });
    }

    /**
     * Observe a proxy container found via [fx-key]'s fx-proxy attribute.
     * Tracks first-run to avoid triggering on the initial mutation.
     */
    private observeKeyProxyElement(element: HTMLElement, binding: FluxDirective): void {
        let previousValue: string | null = null;
        let isFirstRun = true;

        // For previousElementSibling (e.g. UploadField), the [fx-key] element is a leaf
        // (the file input), and mutations happen inside its previous sibling (the holder div).
        // Observe that sibling and query the proxy within it.
        // For all other types, observe the field container itself.
        const observeTarget: HTMLElement = binding.proxyType === "previousElementSibling"
            ? (element.previousElementSibling as HTMLElement) ?? element
            : element;

        const observer = new MutationObserver(() => {
            const proxiedElement = observeTarget.querySelector(binding.proxySelector!) as HTMLElement;

            if (!proxiedElement) return;

            const currentValue = getElementValue(proxiedElement);

            if (isFirstRun) {
                previousValue = currentValue;
                isFirstRun = false;
                return;
            }

            if (currentValue !== previousValue) {
                previousValue = currentValue;
                this.fluxState.updateField(binding.key, currentValue, {
                    owner: binding.owner ?? undefined,
                });
                this.onTriggerUpdate(binding.owner);
            }
        });

        observer.observe(observeTarget, {
            childList: true,
            subtree: true,
            characterData: false,
        });
    }

    private setupTinyMCEListener(element: HTMLElement, binding: FluxDirective): void {
        const editor = (window as any).tinymce?.get(element.id);

        if (editor) {
            editor.on("keyup", () => {
                document
                    .querySelector(".flux-refresh__button")
                    ?.classList.toggle("hidden", false);

                this.hostChannel.broadcastMessage({
                    type: "textUpdate",
                    key: binding.key,
                    owner: binding.owner,
                    event: binding.event,
                    value: editor.getContent(),
                });
            });
        }
    }

    private extractEventData(
        event: Event,
        eventType: string | null,
        element: HTMLElement,
    ): { value: any; type: string } {
        let value: any;
        let type: string = "HTML";
        const target = event.target as any;

        if (eventType === "keyup") {
            value = target.value;
            if (element.getAttribute("fx-event-type") === "templateUpdate") {
                type = "HTML";
            } else if (value.length < 1) {
                type = "HTML";
            } else {
                type = "Text";
            }
        } else if (eventType === "click") {
            value = target.checked;
            type = "HTML";
        } else if (eventType === "change") {
            value = target.value || target.checked;
            type = "HTML";
        }

        return { value, type };
    }
}
