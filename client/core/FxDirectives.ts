/**
 * htmx-lite directive runtime: fx-get, fx-post, fx-trigger, fx-target, fx-swap.
 * Scope is deliberately small — no SSE, no out-of-band swaps, no extended trigger syntax.
 * Default triggers: click for links/buttons, change for inputs, submit for forms, load for others (once on init).
 */

import { logger } from "./logger";

type SwapStrategy =
    | "innerHTML"
    | "outerHTML"
    | "beforebegin"
    | "afterbegin"
    | "beforeend"
    | "afterend";

const READY_ATTR = "fx-directive-ready";

function defaultTrigger(el: Element): string {
    const tag = el.tagName;
    if (tag === "A" || tag === "BUTTON") return "click";
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return "change";
    if (tag === "FORM") return "submit";
    return "load";
}

function parseSwap(value: string | null): SwapStrategy {
    const allowed: SwapStrategy[] = [
        "innerHTML", "outerHTML",
        "beforebegin", "afterbegin", "beforeend", "afterend",
    ];
    if (value && (allowed as string[]).includes(value)) {
        return value as SwapStrategy;
    }
    return "innerHTML";
}

const VALUED_TAGS = ["INPUT", "SELECT", "TEXTAREA"];

const DEBOUNCED_TRIGGERS = ["input", "keyup", "keydown", "keypress", "search", "change"];

const DEFAULT_DEBOUNCE_MS = 500;

function debounceFor(el: Element, trigger: string): number {
    const attr = el.getAttribute("fx-debounce");

    if (attr === null) {
        return DEBOUNCED_TRIGGERS.includes(trigger) ? DEFAULT_DEBOUNCE_MS : 0;
    }

    const parsed = Number.parseInt(attr, 10);

    if (!Number.isFinite(parsed) || parsed < 0) {
        logger.warn(`fx-debounce: "${attr}" is not a positive number, using ${DEFAULT_DEBOUNCE_MS}ms`, el);
        return DEFAULT_DEBOUNCE_MS;
    }

    return parsed;
}

function appendValueParam(el: Element, url: string): string {
    if (!VALUED_TAGS.includes(el.tagName)) return url;

    const valued = el as HTMLInputElement;
    const name = el.getAttribute("fx-param") || valued.name || "q";

    try {
        const target = new URL(url, window.location.href);
        target.searchParams.set(name, valued.value ?? "");
        return target.toString();
    } catch (error) {
        logger.warn(`fx-get: could not add "${name}" to ${url}:`, error);
        return url;
    }
}

function resolveTarget(el: Element, targetSelector: string | null): Element | null {
    if (!targetSelector || targetSelector === "this") return el;
    return document.querySelector(targetSelector);
}

function performSwap(target: Element, html: string, strategy: SwapStrategy): void {
    if (strategy === "innerHTML") {
        target.innerHTML = html;
        return;
    }
    if (strategy === "outerHTML") {
        target.outerHTML = html;
        return;
    }
    target.insertAdjacentHTML(strategy, html);
}

async function fire(el: Element, method: "GET" | "POST", requestUrl: string): Promise<void> {
    let url = requestUrl;
    if (method === "GET") {
        url = appendValueParam(el, requestUrl);
    }

    const target = resolveTarget(el, el.getAttribute("fx-target"));
    if (!target) {
        logger.warn(`fx-${method.toLowerCase()}: target not found for`, el);
        return;
    }

    const swap = parseSwap(el.getAttribute("fx-swap"));

    let body: BodyInit | undefined;
    if (method === "POST" && el.tagName === "FORM") {
        body = new FormData(el as HTMLFormElement);
    }

    try {
        const response = await fetch(url, {
            method,
            credentials: "same-origin",
            body,
        });
        if (!response.ok) {
            logger.warn(`fx-${method.toLowerCase()} ${url} → ${response.status}`);
            return;
        }
        performSwap(target, await response.text(), swap);
    } catch (error) {
        logger.warn(`fx-${method.toLowerCase()} ${url} failed:`, error);
    }
}

function bind(el: Element): void {
    if (el.hasAttribute(READY_ATTR)) return;

    const getUrl = el.getAttribute("fx-get");
    const postUrl = el.getAttribute("fx-post");
    if (!getUrl && !postUrl) return;

    el.setAttribute(READY_ATTR, "1");

    const method: "GET" | "POST" = getUrl ? "GET" : "POST";
    const url = (getUrl ?? postUrl) as string;
    const trigger = el.getAttribute("fx-trigger") || defaultTrigger(el);

    if (trigger === "load") {
        void fire(el, method, url);
        return;
    }

    const wait = debounceFor(el, trigger);
    let timer: ReturnType<typeof setTimeout> | undefined;

    el.addEventListener(trigger, (event) => {
        if (trigger === "submit" || trigger === "click") {
            event.preventDefault();
        }

        if (wait === 0) {
            void fire(el, method, url);
            return;
        }

        clearTimeout(timer);
        timer = setTimeout(() => void fire(el, method, url), wait);
    });
}

export function applyFxDirectives(root: ParentNode = document): void {
    root.querySelectorAll("[fx-get], [fx-post]").forEach(bind);
}

export function initFxDirectives(): void {
    const run = () => applyFxDirectives();

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", run, { once: true });
        return;
    }

    run();
}
