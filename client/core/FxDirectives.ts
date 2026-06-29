/**
 * htmx-lite directive runtime: fx-get, fx-post, fx-trigger, fx-target, fx-swap.
 *
 * Scope is deliberately small — no SSE, no out-of-band swaps, no extended
 * trigger syntax. A point of unification rather than a feature surface.
 *
 *   <button fx-get="/partial" fx-target="#out" fx-swap="innerHTML">Reload</button>
 *
 * Default trigger:
 *   - <a>, <button>          → click
 *   - <input>, <select>      → change
 *   - <form>                 → submit
 *   - anything else          → load (fires once on init)
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

async function fire(el: Element, method: "GET" | "POST", url: string): Promise<void> {
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

    el.addEventListener(trigger, (event) => {
        if (trigger === "submit" || trigger === "click") {
            event.preventDefault();
        }
        void fire(el, method, url);
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
