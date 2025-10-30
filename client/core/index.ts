/**
 * @skip @ignore
 * I did a brief spike into a "livewire" like implementation using this system via events
 * Might continue exploring it later.
 * Delibrate repeatition of functionality
 */

declare global {
    interface Window {
        FluxConfig: {
            id: number;
            Fields: [],
            Events: [],
        };
    }
}

import DOMPurify from "dompurify";
import { logger } from "./logger";

const API_ENDPOINT = "/flux/api";

type FunctionRegistry = {
    [key: string]: () => void;
};

enum FluxAttrs {
    EVENT = "fx-event",
    ACTION = "fx-action",
}

// User-defined functions registry
const functionRegistry: FunctionRegistry = {
    callTest: () => {
        console.log("test");
    },
    anotherFunction: () => {
        console.log("another function called");
    },
};

/**
 * Resolves action to a callable function
 * Supports both string names (from registry) and direct callbacks
 */
const resolveAction = (action: string | (() => void)): (() => void) | null => {
    if (typeof action === "function") {
        return action;
    }

    if (typeof action === "string" && functionRegistry[action]) {
        return functionRegistry[action];
    }

    console.warn(`Action "${action}" not found in function registry`);
    return null;
};

const updateDOMTemplate = (event: FluxEvent, newDOMContent: string) => {
    if (!event.target) return;

    // @TODO include TrustedTypes API createNew check
    const sanitizedHTML = DOMPurify.sanitize(newDOMContent);

    const target = document.querySelector(event.target);
    if (!target) return;

    if (event.replace === "innerHTML") {
        target.innerHTML = sanitizedHTML;
        return;
    }

    if (event.replace === "outerHTML") {
        target.outerHTML = sanitizedHTML;
        return;
    }

    if (event.replace) {
        target.insertAdjacentHTML(event.replace, sanitizedHTML);
    }
};

/**
 * Fetches the
 * @param event
 */
const fetchEvent = (event: FluxEvent) => {
    if (!event.endpoint) return;

    fetch(`${API_ENDPOINT}/${event.endpoint}`)
        .then((res) => {
            const trustedFromServer = res.headers.get("X-Flux-Trusted");

            if (trustedFromServer === "false") {
                logger.warn("Source HTML returned unsafe html");
            }
            return res.json();
        })
        .then((json) => {
            updateDOMTemplate(event, json.html);
        });
};

/**
 * Flux in theory allows for developers to either add the events in the template
 * As well as adding it via a config file
 */
const mapEventToDOM = (fluxEvent: FluxEvent) => {
    const target: Element | null = document.querySelector(fluxEvent.target);
    target?.setAttribute(FluxAttrs.EVENT, fluxEvent.event);

    if (fluxEvent.event && fluxEvent.action) {
        const actionFn = resolveAction(fluxEvent.action);
        if (actionFn) {
            target?.addEventListener(fluxEvent.event, actionFn);
        }
    }

    // FluxRequests should still probably require you to define the click event handler
    if (fluxEvent.endpoint) {
        target?.addEventListener("click", () => fetchEvent(fluxEvent));
    }
};

const mapEventsToDom = (events: FluxEvent[]) => {
    events.forEach((event) => mapEventToDOM(event));
};

// Intentionally commented out
// Mock what a developer would need to add to their own code
// Aternaitvely this could also be done via a `flux_events` array on the DataObject similar to flux_fields
// const boot = () => {
// Example with multiple events using both string names and callbacks
// const events: FluxEvent[] = [
//     {
//         target: ".page__title",
//         // Actions need to be registered to the FunctionRegistry
//         action: "callTest",
//         event: "click",
//         delay: 500,
//     },
//     {
//         target: ".page__summary",
//         // Could also support function call, would only work if they implement FluxComponents via their JS
//         action: () => console.log("inline callback"),
//         event: "mouseover",
//     },
//     {
//         target: ".page__request",
//         endpoint: "/getContent",
//         method: "get",
//         event: "click",
//         replace: "beforebegin",
//     },
// ];

//     // mapEventsToDom(events);
// };

// window.addEventListener('DOMContentLoaded', () => {
//     console.log(window.FluxConfig);
// });
