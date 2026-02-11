/**
 * FluxLiveState - Manages form field state for live CMS preview updates
 *
 * Tracks field changes in the CMS and sends them to the backend for template updates
 */

import { logger } from "../core/logger";

interface FluxFieldState {
    key: string;
    value: any;
    type?: string;
    owner?: string;
    segmentType: 'Page' | 'Element';
    className: string;
    segmentID: string | number;
    updatedAt: number;
}

interface FluxConfigSegment {
    Type: 'Page' | 'Element';
    ClassName: string;
    ID: string | number;
    owner?: string;
}

interface FluxConfigStructure {
    Segments: FluxConfigSegment[];
    ChangeSet: Record<string, Record<string, any>>;
    Events: any[];
}

class FluxLiveState {
    private isLiveStateActive: boolean = true;
    private fields: Map<string, FluxFieldState>;
    private pageID: number | null;
    private className: string | null;
    private segments: FluxConfigSegment[];
    private objects: Map<string, {}>;

    constructor() {
        this.fields = new Map();
        this.pageID = null;
        this.className = null;
        this.segments = [];
        this.objects = new Map();
        this.initializeFromFluxConfig();
    }

    /**
     * Initialize state from global FluxConfig
     * Segments is now a flat array
     */
    private initializeFromFluxConfig(): void {
        if (typeof window !== 'undefined' && (window as any).FluxConfig) {
            const config: FluxConfigStructure = (window as any).FluxConfig;
            this.segments = config.Segments || [];

            // Find the Page segment
            const pageSegment = this.segments.find(s => s.Type === 'Page');
            if (pageSegment) {
                this.pageID = pageSegment.ID ? Number(pageSegment.ID) : null;
                this.className = pageSegment.ClassName || null;
            }
        }
    }

    /**
     * Update a field's value in the state
     * Now includes segment ownership information
     */
    public updateField(
        key: string,
        value: any,
        options?: {
            type?: string,
            owner?: string,
            segmentType?: 'Page' | 'Element',
            className?: string,
            segmentID?: string | number
        }
    ): void {
        // Find the segment this field belongs to
        let segment: FluxConfigSegment | undefined;

        if (options?.owner) {
            // Find segment by owner
            segment = this.segments.find(s => s.owner === options.owner);
        } else {
            // Default to Page segment
            segment = this.segments.find(s => s.Type === 'Page');
        }

        this.fields.set(key, {
            key,
            value,
            type: options?.type,
            owner: options?.owner || segment?.owner,
            segmentType: options?.segmentType || segment?.Type || 'Page',
            className: options?.className || segment?.ClassName || '',
            segmentID: options?.segmentID || segment?.ID || '',
            updatedAt: Date.now()
        });

        if (process.env.NODE_ENV === 'development') {
            // @ts-ignore
            window.FluxLiveState = this; // Expose for debugging
        }
    }

    /**
     * Get a field's current value
     */
    public getField(key: string): any {
        const field = this.fields.get(key);
        return field ? field.value : null;
    }

    /**
     * Get all changed fields as a plain object
     */
    public getChangedFields(): Record<string, any> {
        const fields: Record<string, any> = {};
        this.fields.forEach((fieldData, key) => {
            fields[key] = fieldData.value;
        });
        return fields;
    }

    /**
     * Get changed fields grouped by segment
     * Returns a structure that maps owner -> fields
     */
    public getChangedFieldsBySegment(): Record<string, any> {
        const segmentChanges: Record<string, any> = {};

        this.fields.forEach((fieldData) => {
            const segmentKey = fieldData.owner || 'Page';

            if (!segmentChanges[segmentKey]) {
                segmentChanges[segmentKey] = {
                    segmentType: fieldData.segmentType,
                    className: fieldData.className,
                    segmentID: fieldData.segmentID,
                    owner: fieldData.owner,
                    fields: {}
                };
            }

            segmentChanges[segmentKey].fields[fieldData.key] = fieldData.value;
        });

        return segmentChanges;
    }

    /**
     * Clear all changed fields
     */
    public clear(): void {
        this.fields.clear();
    }

    /**
     * Get the state as JSON for sending to the server
     * Includes segment ownership information
     */
    public toJSON(): object {
        return {
            pageID: this.pageID,
            className: this.className,
            segments: this.segments,
            fields: this.getChangedFields(),
            segmentChanges: this.getChangedFieldsBySegment()
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
     * Send state to the backend and get updated template
     */
    public async sendUpdate(apiEndpoint: string): Promise<any> {
        const state = this.toJSON();

        console.log('state', state);

        if (this.pageID === null) {
            throw new Error(`Missing page id`);
        };

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

        const data = await response.json();
        return data;
    }

    /**
     * Send a block-scoped update for a specific segment owner
     */
    public async sendBlockUpdate(apiEndpoint: string, owner: string): Promise<any> {
        const segmentChanges = this.getChangedFieldsBySegment();
        const segment = segmentChanges[owner];

        if (!segment) {
            throw new Error(`No segment changes found for owner: ${owner}`);
        }

        if (this.pageID === null) {
            throw new Error(`Missing page id`);
        }

        const payload = {
            pageID: this.pageID,
            className: this.className,
            owner: owner,
            segmentType: segment.segmentType,
            segmentClassName: segment.className,
            segmentID: segment.segmentID,
            fields: segment.fields,
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

    /**
     * Set the page ID
     */
    public setPageID(pageID: number): void {
        this.pageID = pageID;
    }

    /**
     * Set the class name
     */
    public setClassName(className: string): void {
        this.className = className;
    }

    public setLiveStateActive(isActive: boolean): void {
        this.isLiveStateActive = isActive;
    }

    public getIsActive(): boolean {
        return this.isLiveStateActive;
    }


    public addToObject(key: string): void
    {
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
            fields: this.getChangedFields(),
            fieldCount: this.fields.size,
            isLiveStateActive: this.isLiveStateActive,
        });
    }
}

export default FluxLiveState;
