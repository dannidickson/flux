/**
 * FluxLiveState — in-memory form field state for live CMS preview updates.
 *
 * Uses FluxConfig.ChangeSet (keyed by ClassName) as the single source of truth
 * for field changes. Segments provides the structural map of the page.
 */
import { logger } from "../core/logger";
import type {
    FluxChangeSetPayload,
    FluxChunkedSavePayload,
    FluxConfigSegment,
    FluxConfigStructure,
} from "../types/flux.interface";

class FluxLiveState {
    private isLiveStateActive = true;
    private pageIDOverride: number | null = null;
    private classNameOverride: string | null = null;

    private getConfig(): FluxConfigStructure | null {
        if (typeof window !== "undefined" && window.FluxConfig) {
            return window.FluxConfig;
        }
        return null;
    }

    private get segments(): FluxConfigSegment[] {
        return this.getConfig()?.Segments ?? [];
    }

    private get pageID(): number | null {
        if (this.pageIDOverride !== null) return this.pageIDOverride;
        const page = this.segments.find((s) => s.Type === "Page");
        return page?.ID ? Number(page.ID) : null;
    }

    private get className(): string | null {
        if (this.classNameOverride !== null) return this.classNameOverride;
        return this.segments.find((s) => s.Type === "Page")?.ClassName ?? null;
    }

    private segmentKey(segment: FluxConfigSegment): string {
        return `${segment.Type}:${segment.ClassName}:${segment.ID}`;
    }

    updateField(
        key: string,
        value: unknown,
        options?: { type?: string; owner?: string },
    ): void {
        const segment = options?.owner
            ? this.segments.find((s) => s.owner === options.owner)
            : this.segments.find((s) => s.Type === "Page");

        const config = this.getConfig();

        if (!segment) {
            logger.error(
                `No segment for field "${key}" (owner="${options?.owner ?? "<page>"}") — change not recorded, preview will fall back to saved content. Known owners:`,
                this.segments.map((s) => s.owner ?? `${s.Type}:${s.ID}`),
            );
            return;
        }

        if (!config) {
            logger.error(
                `No FluxConfig available — change to "${key}" dropped`,
            );
            return;
        }

        // PHP sometimes serialises an empty ChangeSet as `[]` — normalise to `{}`.
        if (Array.isArray(config.ChangeSet)) {
            config.ChangeSet = {};
        }

        const recordKey = this.segmentKey(segment);
        if (!config.ChangeSet[recordKey]) {
            config.ChangeSet[recordKey] = {};
        }

        config.ChangeSet[recordKey][key] = value;

        if (process.env.NODE_ENV === "development") {
            (
                window as Window & { FluxLiveState?: FluxLiveState }
            ).FluxLiveState = this;
        }
    }

    getChangeSet(): Record<string, Record<string, unknown>> {
        const config = this.getConfig();
        return config?.ChangeSet || {};
    }

    hasChanges(): boolean {
        return Object.keys(this.getChangeSet()).length > 0;
    }

    /**
     * Forget every recorded change. Returns the record keys that were dropped
     * so callers can report what they threw away.
     */
    clear(): string[] {
        const config = this.getConfig();
        if (!config) {
            return [];
        }

        const dropped = Object.keys(config.ChangeSet ?? {});
        config.ChangeSet = {};
        return dropped;
    }

    /**
     * Clear the record by type
     * EG: 'Element',
     *
     * Returns the record keys that were cleared.
     */
    clearRecord(type: string, id: string | number): string[] {
        const config = this.getConfig();
        if (config === null || !config.ChangeSet) {
            return [];
        }

        const clearedKeys = Object.keys(config.ChangeSet)
        .filter(key => {
            return key.startsWith(`${type}:`) && key.endsWith(`:${id}`)
        });

        for (const recordKey of clearedKeys) {
            delete config.ChangeSet[recordKey];
        }

        return clearedKeys;
    }

    /**
     * Returns the ChangeSet structured by segment Type for the API:
     *   "Page": { ClassName, ID, fields }
     *   "Element": [{ ClassName, ID, fields }, ...]
     */
    getChangeSetPayload(): Record<string, unknown> {
        const rawChangeSet = this.getChangeSet();
        const payload: Record<string, unknown> = {};
        const consumed = new Set<string>();

        for (const segment of this.segments) {
            const recordKey = this.segmentKey(segment);
            const fields = rawChangeSet[recordKey];
            if (!fields || Object.keys(fields).length === 0) continue;

            consumed.add(recordKey);
            const entry = {
                ClassName: segment.ClassName,
                ID: segment.ID,
                fields,
            };

            if (segment.Type === "Page") {
                payload["Page"] = entry;
            } else {
                if (!payload[segment.Type]) {
                    payload[segment.Type] = [];
                }
                (payload[segment.Type] as unknown[]).push(entry);
            }
        }

        const orphaned = Object.keys(rawChangeSet).filter(
            (recordKey) =>
                !consumed.has(recordKey) &&
                Object.keys(rawChangeSet[recordKey] ?? {}).length > 0,
        );
        if (orphaned.length) {
            logger.error(
                "Pending changes have no matching segment in the current context and will not be sent:",
                orphaned,
            );
        }

        return payload;
    }

    /**
     * Full-page update payload. Throws if we don't yet know the page id.
     */
    toPageUpdatePayload(): FluxChangeSetPayload {
        if (this.pageID === null) {
            throw new Error("Missing page id");
        }
        return {
            pageID: this.pageID,
            className: this.className,
            changeSet: this.getChangeSetPayload(),
        };
    }

    /**
     * Block-scoped update payload, filtered to the given owner's segment.
     */
    toBlockUpdatePayload(owner: string): FluxChangeSetPayload {
        const segment = this.segments.find((s) => s.owner === owner);
        if (!segment) {
            throw new Error(`No segment found for owner: ${owner}`);
        }

        const fields = this.getChangeSet()[this.segmentKey(segment)];
        if (!fields || Object.keys(fields).length === 0) {
            throw new Error(`No changes found for owner: ${owner}`);
        }

        if (this.pageID === null) {
            throw new Error("Missing page id");
        }

        return {
            pageID: this.pageID,
            className: this.className,
            changeSet: {
                [segment.Type]: [
                    {
                        ClassName: segment.ClassName,
                        ID: segment.ID,
                        fields,
                    },
                ],
            },
        };
    }

    getSegments(): FluxConfigSegment[] {
        return this.segments;
    }

    /**
     * Build a chunked save payload for saving.
     * matches each ClassName to its segment, and emits one chunk per Type, Classname, ID
     */
    getChunkedSavePayload(): FluxChunkedSavePayload {
        const changeSet = this.getChangeSet();
        const chunks: FluxChunkedSavePayload['chunks'] = [];

        for (const segment of this.segments) {
            const fields = changeSet[this.segmentKey(segment)];
            if (!fields || Object.keys(fields).length === 0) continue;

            chunks.push({
                kind: (
                    segment.Type === "Page" || segment.Type === "Element"
                        ? segment.Type
                        : "DataObject"
                ) as "Page" | "Element" | "DataObject",
                class: segment.ClassName,
                id: Number(segment.ID),
                fields,
            });
        }

        return {
            context: { pageId: this.pageID, pageClass: this.className },
            chunks,
        };
    }

    getElements(): FluxConfigSegment[] {
        return this.segments.filter((s) => s.Type === "Element");
    }

    setPageID(pageID: number): void {
        this.pageIDOverride = pageID;
    }

    setClassName(className: string): void {
        this.classNameOverride = className;
    }

    setLiveStateActive(isActive: boolean): void {
        this.isLiveStateActive = isActive;
    }

    getIsActive(): boolean {
        return this.isLiveStateActive;
    }

    debug(): void {
        logger.log("FluxLiveState:", {
            pageID: this.pageID,
            className: this.className,
            segments: this.segments,
            changeSet: this.getChangeSet(),
            isLiveStateActive: this.isLiveStateActive,
        });
    }
}

export default FluxLiveState;
