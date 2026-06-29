/**
 * Drag-and-drop reorder within a single Flux relation.
 *
 * A drop-zone container is marked by FluxDirectives with:
 *   fx-sortable
 *   fx-grid-name="<relation>"
 *   fx-grid-item-selector="<css>"
 *   fx-grid-sort-field="<column>"  (optional — server uses default if absent)
 *
 * Each item inside has `fx-owner="<recordId>"` (already stamped by relation
 * binding). On drop, we compute the new ordered ID list from DOM order
 * and emit a `gridFieldAction` message with `action: 'reorder'`. The
 * host translates this into the same request `GridFieldOrderableRows`
 * would normally fire.
 */

import { logger } from "../core/logger";

const READY_ATTR = "fx-sortable-ready";

interface ZoneConfig {
    relationKey: string;
    itemSelector: string;
    sortField?: string;
}

export function initSortable(channel: MessagePort | null): void {
    if (!channel) return;

    document.querySelectorAll<HTMLElement>("[fx-sortable]").forEach((zone) => {
        if (zone.hasAttribute(READY_ATTR)) return;
        zone.setAttribute(READY_ATTR, "1");

        const relationKey = zone.getAttribute("fx-grid-name");
        const itemSelector = zone.getAttribute("fx-grid-item-selector");
        if (!relationKey || !itemSelector) return;

        const config: ZoneConfig = {
            relationKey,
            itemSelector,
            sortField: zone.getAttribute("fx-grid-sort-field") ?? undefined,
        };

        bindZone(zone, config, channel);
    });
}

function bindZone(zone: HTMLElement, config: ZoneConfig, channel: MessagePort): void {
    const items = Array.from(zone.querySelectorAll<HTMLElement>(config.itemSelector));
    items.forEach((item) => attachDrag(zone, item, config, channel));
}

function attachDrag(zone: HTMLElement, item: HTMLElement, config: ZoneConfig, channel: MessagePort): void {
    item.setAttribute("draggable", "true");
    item.style.cursor ||= "grab";

    let fromIndex = -1;

    item.addEventListener("dragstart", (event) => {
        item.setAttribute("data-flux-dragging", "");
        fromIndex = indexOf(zone, item, config.itemSelector);
        event.dataTransfer?.setData("text/plain", item.getAttribute("fx-owner") ?? "");
        event.dataTransfer && (event.dataTransfer.effectAllowed = "move");
    });

    item.addEventListener("dragend", () => {
        item.removeAttribute("data-flux-dragging");

        const owner = item.getAttribute("fx-owner");
        const toIndex = indexOf(zone, item, config.itemSelector);
        if (!owner || toIndex === fromIndex || toIndex < 0) return;

        const orderedIds = Array.from(zone.querySelectorAll<HTMLElement>(config.itemSelector))
            .map((el) => el.getAttribute("fx-owner"))
            .filter((id): id is string => !!id);

        logger.log(`dragEventEnd: ${config.relationKey} moved ${owner} ${fromIndex} → ${toIndex}`);

        channel.postMessage({
            type: "dragEventEnd",
            key: config.relationKey,
            owner,
            fromIndex,
            toIndex,
            orderedIds,
            sortField: config.sortField,
        });
    });

    item.addEventListener("dragover", (event) => {
        event.preventDefault();
        const dragging = zone.querySelector<HTMLElement>("[data-flux-dragging]");
        if (!dragging || dragging === item) return;

        const rect = item.getBoundingClientRect();
        const after = (event.clientY - rect.top) > rect.height / 2;
        if (after) item.after(dragging);
        else item.before(dragging);
    });
}

function indexOf(zone: HTMLElement, item: HTMLElement, itemSelector: string): number {
    const items = Array.from(zone.querySelectorAll<HTMLElement>(itemSelector));
    return items.indexOf(item);
}
