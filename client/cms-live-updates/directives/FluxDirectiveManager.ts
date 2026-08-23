import HostChannel from "../../channels/HostChannel";
import FluxLiveState from "../FluxLiveState";
import { logger } from "../../core/logger";
import type { JQueryElement, TinyMCEEditor } from "../../types/flux.interface";
import {
    fromAttributes,
    fromElement,
    getElementValue,
    type FluxDirective,
} from "./FluxDirectives";
import { fluxAttributesForField, reportSchemaFallback } from "./FluxFormSchema";

/** Events a schema-bound field can be configured to fire on (fx-event). */
const DELEGATED_EVENTS = ["click", "change", "keyup"];

function shouldUpgradeToHtml(
    previous: string,
    next: unknown,
    inlineEditActive: boolean,
): boolean {
    if (inlineEditActive) return false;
    return previous.trim().length === 0 && String(next).trim().length > 0;
}

export default class FluxDirectiveManager {
    constructor(
        private $: JQueryElement,
        private fluxState: FluxLiveState,
        private onTriggerUpdate: (owner: string | null) => void,
        private hostChannel: HostChannel,
        private onPatchUpdate: (
            key: string,
            value: string,
            owner: string | null,
        ) => void,
    ) {}

    /**
     * Last value seen per schema-bound field. These can't be tracked on the
     * element the way the entwine bindings do — React hands us a new node on
     * every change — so they're keyed by input name instead.
     */
    private schemaBoundValues = new Map<string, string>();

    initialize(): void {
        const manager = this;
        this.$.entwine("flux", function ($: JQueryElement) {
            manager.setupKeyBindings($);
        });
        this.setupSchemaBindings();
    }

    /**
     * Fields whose React component drops the fx-* attributes never match
     * `[fx-key]`, so the entwine binding above never sees them (Boolean fields
     * are the common case — an unchecked `<% if $ShowTitle %>` would do
     * nothing). Their bindings still exist in the form schema, so listen at the
     * document and look them up by input name.
     *
     * Capture phase: a checkbox's `checked` is already flipped by the time the
     * click event dispatches, and listening early keeps us clear of whatever
     * React does with the event afterwards.
     */
    private setupSchemaBindings(): void {
        const handler = (event: Event): void => this.handleSchemaBoundEvent(event);
        for (const eventType of DELEGATED_EVENTS) {
            document.addEventListener(eventType, handler, true);
        }
    }

    private handleSchemaBoundEvent(event: Event): void {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;

        const name = (target as HTMLInputElement).name;
        if (!name) return;

        // Anything carrying its own attributes is the entwine binding's.
        if (target.closest("[fx-key]")) return;

        const attributes = fluxAttributesForField(name);
        if (!attributes) return;

        const binding = fromAttributes(target, attributes);
        if (!binding || binding.event !== event.type) return;

        reportSchemaFallback(name, binding.key);

        this.schemaBoundValues.set(
            name,
            this.handleInputChange(
                event,
                target,
                binding,
                this.schemaBoundValues.get(name) ?? "",
            ),
        );
    }

    private setupKeyBindings($: any): void {
        const manager = this;

        $("[fx-key]").entwine({
            onmatch: function (this: any) {
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
                        previousValue = manager.handleInputChange(
                            listenerEvent,
                            element,
                            binding,
                            previousValue,
                        );
                    },
                );
            },
        });
    }

    private handleInputChange(
        listenerEvent: Event,
        element: HTMLElement,
        binding: FluxDirective,
        previousValue: string,
    ): string {
        let value: any;
        let rawType: string;

        if (binding.collectSelector) {
            value = Array.from(
                element.querySelectorAll(binding.collectSelector),
            ).map((el) => (el as HTMLInputElement).value);
            rawType = "HTML";
        } else {
            ({ value, type: rawType } = this.extractEventData(
                listenerEvent,
                binding.event,
                element,
            ));
        }

        // Upgrade Text → HTML when a field transitions from empty to non-empty,
        // so a full template re-render is triggered instead of a text patch.
        let type = rawType;
        if (rawType === "Text" && shouldUpgradeToHtml(previousValue, value, this.hostChannel.isInlineEditInProgress)) {
            type = "HTML";
        }

        const nextPreviousValue = String(value);

        this.fluxState.updateField(binding.key, value, {
            type,
            owner: binding.owner ?? undefined,
        });

        logger.log(
            `[textUpdate] host input change: key="${binding.key}" owner="${binding.owner}" type="${type}" active=${this.fluxState.getIsActive()}`,
            value,
        );

        if (!this.fluxState.getIsActive()) return nextPreviousValue;

        if (type === "Text") {
            this.hostChannel.broadcastMessage({
                type: "textUpdate",
                key: binding.key,
                owner: binding.owner,
                event: binding.event,
                value,
            });
            return nextPreviousValue;
        }

        this.onTriggerUpdate(binding.owner);
        return nextPreviousValue;
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
            const proxiedElement = observeTarget.querySelector<HTMLElement>(
                binding.proxySelector!,
            );

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
        const editor = window.tinymce?.get(element.id);

        if (!editor) return;
        let previousContent: string = editor.getContent() ?? "";

        const getChangedContent = (): { editor: TinyMCEEditor; content: string } | null => {
            const ed = window.tinymce?.get(element.id);
            if (!ed?.hasFocus()) return null;
            const content = ed.getContent();
            if (content === previousContent) return null;
            previousContent = content;
            return { editor: ed, content };
        };

        // An editor's value is markup, so it has to be morphed into the bound
        // element rather than patched as text — a textUpdate would put the
        // literal "<p>abc</p>" on the page.
        const sendRichTextUpdate = () => {
            const result = getChangedContent();
            if (!result) return;
            const { editor: ed, content } = result;

            // When shortcodes are present, use the editor body's innerHTML instead
            // — TinyMCE renders shortcodes as real DOM elements that morph smoothly,
            // where getContent() would hand us the unrendered shortcode syntax.
            const value = this.containsShortcode(content)
                ? ed.getBody().innerHTML
                : content;

            // Record the editor's own markup, never the rendered body: the
            // ChangeSet is replayed through the server on the next template
            // update, and it has to carry the shortcode source the record
            // actually stores. Without this the preview shows the typing but
            // the next full render throws it away for the saved content.
            this.fluxState.updateField(binding.key, content, {
                type: "HTML",
                owner: binding.owner ?? undefined,
            });

            this.hostChannel.broadcastMessage({
                type: "richTextUpdate",
                key: binding.key,
                owner: binding.owner,
                value,
            });
        };

        const sendPatchUpdate = () => {
            const result = getChangedContent();
            if (!result) return;
            const { content } = result;

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
            sendRichTextUpdate();
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
            if (element.getAttribute("fx-event-type") === "templateUpdate" || value.length < 1) {
                type = "HTML";
            } else {
                type = "Text";
            }
        } else if (eventType === "click") {
            value = target.checked;
            type = "HTML";
        } else if (eventType === "change") {
            value = target.type === "checkbox" ? target.checked : target.value;
            type = "HTML";
        }

        return { value, type };
    }
}
