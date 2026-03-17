/**
 * FluxLiveState - Manages form field state for live CMS preview updates
 *
 * Uses FluxConfig.ChangeSet (keyed by ClassName) as the single source of truth
 * for field changes. Segments provides the structural map of the page.
 */

import Logger, { logger } from "../core/logger";
import type { FluxConfigSegment, FluxConfigStructure } from "../types/flux.interface";

class FluxLiveState {
    private isLiveStateActive: boolean = true;
    private pageID: number | null;
    private className: string | null;
    private segments: FluxConfigSegment[];
    private objects: Map<string, {}>;

    constructor() {
        this.pageID = null;
        this.className = null;
        this.segments = [];
        this.objects = new Map();
        this.initializeFromFluxConfig();
    }

    private getConfig(): FluxConfigStructure | null {
        if (typeof window !== 'undefined' && (window as any).FluxConfig) {
            return (window as any).FluxConfig as FluxConfigStructure;
        }
        return null;
    }

    /**
     * Initialize state from global FluxConfig
     */
    private initializeFromFluxConfig(): void {
        const config = this.getConfig();
        if (config) {
            this.segments = config.Segments || [];

            const pageSegment = this.segments.find(s => s.Type === 'Page');
            if (pageSegment) {
                this.pageID = pageSegment.ID ? Number(pageSegment.ID) : null;
                this.className = pageSegment.ClassName || null;
            }
        }
    }

    /**
     * Update a field's value in the ChangeSet
     */
    public updateField(
        key: string,
        value: any,
        options?: {
            type?: string,
            owner?: string,
        }
    ): void {
        let segment: FluxConfigSegment | undefined;

        if (options?.owner) {
            segment = this.segments.find(s => s.owner === options.owner);
        } else {
            segment = this.segments.find(s => s.Type === 'Page');
        }

        const resolvedClassName = segment?.ClassName || '';
        const config = this.getConfig();

        if (config && resolvedClassName) {
            if (Array.isArray(config.ChangeSet)) {
                config.ChangeSet = {};
            }

            if (!config.ChangeSet[resolvedClassName]) {
                config.ChangeSet[resolvedClassName] = {};
            }

            config.ChangeSet[resolvedClassName][key] = value;
        }

        if (process.env.NODE_ENV === 'development') {
            // @ts-ignore
            window.FluxLiveState = this;
        }
    }

    /**
     * Get the full ChangeSet
     */
    public getChangeSet(): Record<string, Record<string, any>> {
        const config = this.getConfig();
        return config?.ChangeSet || {};
    }

    /**
     * Find the segment metadata for a given owner
     */
    private getSegmentByOwner(owner: string): FluxConfigSegment | undefined {
        return this.segments.find(s => s.owner === owner);
    }

    /**
     * Clear all changed fields from the ChangeSet
     */
    public clear(): void {
        const config = this.getConfig();
        if (config) {
            config.ChangeSet = {};
        }
    }

    /**
     * Build an enriched ChangeSet for the API, keyed by segment Type.
     *
     * Returns: {
     *   "Page": { ClassName, ID, fields },
     *   "Element": [{ ClassName, ID, fields }, ...]
     * }
     */
    public buildChangeSetPayload(): Record<string, any> {
        const rawChangeSet = this.getChangeSet();
        const payload: Record<string, any> = {};

        for (const segment of this.segments) {
            const fields = rawChangeSet[segment.ClassName];
            if (!fields || Object.keys(fields).length === 0) continue;

            const entry = {
                ClassName: segment.ClassName,
                ID: segment.ID,
                fields,
            };

            if (segment.Type === 'Page') {
                payload['Page'] = entry;
            } else {
                if (!payload[segment.Type]) {
                    payload[segment.Type] = [];
                }
                payload[segment.Type].push(entry);
            }
        }

        return payload;
    }

    /**
     * Get the state as JSON for sending to the server
     */
    public toJSON(): object {
        return {
            pageID: this.pageID,
            className: this.className,
            changeSet: this.buildChangeSetPayload(),
        };
    }

    /**
     * Get the segments array
     */
    public getSegments(): FluxConfigSegment[] {
        return this.segments;
    }

    /**
     * Get only Element segments
     */
    public getElements(): FluxConfigSegment[] {
        return this.segments.filter(s => s.Type === 'Element');
    }

    /**
     * Send full state to the backend (page + all element changes)
     */
    public async sendUpdate(apiEndpoint: string): Promise<any> {
        const state = this.toJSON();

        if (this.pageID === null) {
            throw new Error(`Missing page id`);
        }

        const url = `${apiEndpoint}/pageTemplateUpdate?pageID=${this.pageID}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(state)
        });

        if (!response.ok) {
            throw new Error(`Template update failed: ${response.statusText}`);
        }

        return response.json();
    }

    /**
     * Send a block-scoped update for a specific segment owner
     * Filters the ChangeSet to just the relevant segment's ClassName
     */
    public async sendBlockUpdate(apiEndpoint: string, owner: string): Promise<any> {
        const segment = this.getSegmentByOwner(owner);

        if (!segment) {
            throw new Error(`No segment found for owner: ${owner}`);
        }

        const rawChangeSet = this.getChangeSet();
        const fields = rawChangeSet[segment.ClassName];

        if (!fields || Object.keys(fields).length === 0) {
            throw new Error(`No changes found for owner: ${owner}`);
        }

        if (this.pageID === null) {
            throw new Error(`Missing page id`);
        }

        const payload = {
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

        const url = `${apiEndpoint}/blockUpdate?pageID=${this.pageID}&owner=${encodeURIComponent(owner)}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            throw new Error(`Block update failed: ${response.statusText}`);
        }

        return response.json();
    }

    public setPageID(pageID: number): void {
        this.pageID = pageID;
    }

    public setClassName(className: string): void {
        this.className = className;
    }

    public setLiveStateActive(isActive: boolean): void {
        this.isLiveStateActive = isActive;
    }

    public getIsActive(): boolean {
        return this.isLiveStateActive;
    }

    public addToObject(key: string): void {
        this.objects.set(key, {
            key: key,
            type: 'object',
        });
    }

    public getObjects(): Map<string, {}> {
        return this.objects;
    }

    /**
     * Get debug information
     */
    public debug(): void {
        logger.log('FluxLiveState:', {
            pageID: this.pageID,
            className: this.className,
            segments: this.segments,
            changeSet: this.getChangeSet(),
            isLiveStateActive: this.isLiveStateActive,
        });
    }
}

export default FluxLiveState;
