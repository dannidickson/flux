import HostChannel from "../channels/HostChannel";
import FluxLiveState from "./FluxLiveState";
import {
    fromElement,
    getElementValue,
    type FluxDirective,
} from "../core/FluxDirective";

export default class FluxDirectiveManager {
    constructor(
        private $: any,
        private fluxState: FluxLiveState,
        private onTriggerUpdate: (owner: string | null) => void,
        private hostChannel: HostChannel,
        private onPatchUpdate: (
            key: string,
            value: string,
            owner: string | null,
        ) => void,
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
                    return;
                }

                let previousValue: string =
                    (element as HTMLInputElement).value ?? "";

                element.addEventListener(
                    binding.event as string,
                    (listenerEvent: Event) => {
                        let value: any;
                        let type: string;

                        if (binding.collectSelector) {
                            value = Array.from(
                                element.querySelectorAll(
                                    binding.collectSelector,
                                ),
                            ).map((el) => (el as HTMLInputElement).value);
                            type = "HTML";
                        } else {
                            ({ value, type } = manager.extractEventData(
                                listenerEvent,
                                binding.event,
                                element,
                            ));
                        }

                        /**
                         * Trigger a templateUpdate when a field changes
                         * from being empty to including text
                         */
                        if (
                            type === "Text" &&
                            previousValue.trim().length === 0 &&
                            String(value).trim().length > 0 &&
                            !manager.hostChannel.isInlineEditInProgress
                        ) {
                            type = "HTML";
                        }

                        previousValue = String(value);

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
                    },
                );
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

    private observeKeyProxyElement(
        element: HTMLElement,
        binding: FluxDirective,
    ): void {
        let previousValue: string | null = null;
        let isFirstRun = true;

        let observeTarget: HTMLElement = element;

        if (binding.proxyType === "previousElementSibling") {
            observeTarget =
                (element.previousElementSibling as HTMLElement) ?? element;
        } else if (binding.proxyType === "nextElementSibling") {
            observeTarget =
                (element.nextElementSibling as HTMLElement) ?? element;
        }

        const observer = new MutationObserver(() => {
            const proxiedElement =
                binding.proxyType === "nextElementSibling"
                    ? element
                    : (observeTarget.querySelector(
                          binding.proxySelector!,
                      ) as HTMLElement);

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

    private setupTinyMCEListener(
        element: HTMLElement,
        binding: FluxDirective,
    ): void {
        const editor = (window as any).tinymce?.get(element.id);

        if (!editor) return;
        let previousContent: string = editor.getContent() ?? "";
        const sendTextUpdate = () => {
            const currentEditor = (window as any).tinymce.get(element.id);

            if (!currentEditor.hasFocus()) return;

            const content = currentEditor.getContent();
            if (content === previousContent) return;
            previousContent = content;

            // When shortcodes are present, use the editor body's innerHTML instead
            // — TinyMCE renders shortcodes as real DOM elements that morph smoothly.
            if (this.containsShortcode(content)) {
                this.hostChannel.broadcastMessage({
                    type: "richTextUpdate",
                    key: binding.key,
                    owner: binding.owner,
                    value: currentEditor.getBody().innerHTML,
                });
                return;
            }

            this.hostChannel.broadcastMessage({
                type: "textUpdate",
                key: binding.key,
                owner: binding.owner,
                event: binding.event,
                value: content,
            });
        };

        const sendPatchUpdate = () => {
            const currentEditor = (window as any).tinymce.get(element.id);

            if (!currentEditor.hasFocus()) return;

            const content = currentEditor.getContent();
            if (content === previousContent) return;
            previousContent = content;

            document
                .querySelector(".flux-refresh__button")
                ?.classList.toggle("hidden", false);

            this.fluxState.updateField(binding.key, content, {
                type: "HTML",
                owner: binding.owner ?? undefined,
            });

            this.hostChannel.broadcastMessage({
                type: "richTextPatch",
                key: binding.key,
                owner: binding.owner,
                value: content,
            });
            this.onPatchUpdate(binding.key, content, binding.owner);
        };

        editor.on("input", () => {
            sendTextUpdate();
        });
        editor.on("Change", (e: any) => {
            if (!e.originalEvent || e.originalEvent.type === "execcommand") {
                sendPatchUpdate();
            }
        });
    }

    private containsShortcode(content: string): boolean {
        return /\[[a-zA-Z_][\w]*\s[^\]]*\]/.test(content);
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
