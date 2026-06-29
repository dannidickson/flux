/**
 * FluxLiveState — in-memory form field state for live CMS preview updates.
 *
 * Uses FluxConfig.ChangeSet (keyed by ClassName) as the single source of truth
 * for field changes. Segments provides the structural map of the page.
 */
import { logger } from "../core/logger";
import type {
    FluxChangeSetPayload,
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

    updateField(
        key: string,
        value: unknown,
        options?: { type?: string; owner?: string },
    ): void {
        const segment = options?.owner
            ? this.segments.find((s) => s.owner === options.owner)
            : this.segments.find((s) => s.Type === "Page");

        const resolvedClassName = segment?.ClassName || "";
        const config = this.getConfig();

        if (config && resolvedClassName) {
            // PHP sometimes serialises an empty ChangeSet as `[]` — normalise to `{}`.
            if (Array.isArray(config.ChangeSet)) {
                config.ChangeSet = {};
            }

            if (!config.ChangeSet[resolvedClassName]) {
                config.ChangeSet[resolvedClassName] = {};
            }

            config.ChangeSet[resolvedClassName][key] = value;
        }

        if (process.env.NODE_ENV === "development") {
            (window as Window & { FluxLiveState?: FluxLiveState }).FluxLiveState = this;
        }
    }

    getChangeSet(): Record<string, Record<string, unknown>> {
        const config = this.getConfig();
        return config?.ChangeSet || {};
    }

    hasChanges(): boolean {
        return Object.keys(this.getChangeSet()).length > 0;
    }

    clear(): void {
        const config = this.getConfig();
        if (config) {
            config.ChangeSet = {};
        }
    }

    /**
     * Returns the ChangeSet structured by segment Type for the API:
     *   "Page": { ClassName, ID, fields }
     *   "Element": [{ ClassName, ID, fields }, ...]
     */
    getChangeSetPayload(): Record<string, unknown> {
        const rawChangeSet = this.getChangeSet();
        const payload: Record<string, unknown> = {};

        for (const segment of this.segments) {
            const fields = rawChangeSet[segment.ClassName];
            if (!fields || Object.keys(fields).length === 0) continue;

            const entry = { ClassName: segment.ClassName, ID: segment.ID, fields };

            if (segment.Type === "Page") {
                payload["Page"] = entry;
            } else {
                if (!payload[segment.Type]) {
                    payload[segment.Type] = [];
                }
                (payload[segment.Type] as unknown[]).push(entry);
            }
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

        const fields = this.getChangeSet()[segment.ClassName];
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
                [segment.Type]: [{
                    ClassName: segment.ClassName,
                    ID: segment.ID,
                    fields,
                }],
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
    getChunkedSavePayload(): {
        context: { pageId: number | null; pageClass: string | null };
        chunks: Array<{ kind: string; class: string; id: number; fields: Record<string, unknown> }>;
    } {
        const changeSet = this.getChangeSet();
        const chunks: Array<{ kind: string; class: string; id: number; fields: Record<string, unknown> }> = [];

        for (const segment of this.segments) {
            const fields = changeSet[segment.ClassName];
            if (!fields || Object.keys(fields).length === 0) continue;

            chunks.push({
                kind: segment.Type === "Page" || segment.Type === "Element" ? segment.Type : "DataObject",
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
