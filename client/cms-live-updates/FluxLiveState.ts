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
}

class FluxLiveState {
    private fields: Map<string, any>;
    private pageID: number | null;
    private className: string | null;

    constructor() {
        this.fields = new Map();
        this.pageID = null;
        this.className = null;
        this.initializeFromFluxLiveConfig();
    }

    /**
     * Initialize state from global FluxConfig
     */
    private initializeFromFluxLiveConfig(): void {
        if (typeof window !== 'undefined' && (window as any).FluxLiveConfig) {
            const config = (window as any).FluxLiveConfig;
            this.pageID = config.DataObjectID || null;
            this.className = config.ClassName || null;
        }
    }

    /**
     * Update a field's value in the state
     */
    public updateField(key: string, value: any, type?: string): void {
        this.fields.set(key, {
            key,
            value,
            type,
            updatedAt: Date.now()
        });
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
     * Clear all changed fields
     */
    public clear(): void {
        this.fields.clear();
    }

    /**
     * Get the state as JSON for sending to the server
     */
    public toJSON(): object {
        return {
            pageID: this.pageID,
            className: this.className,
            fields: this.getChangedFields()
        };
    }

    /**
     * Send state to the backend and get updated template
     */
    public async sendUpdate(apiEndpoint: string): Promise<any> {

        const state = this.toJSON();

        if (this.pageID === null) {
            throw new Error(`Missing page id`);
        };

        const url = `${apiEndpoint}/templateUpdate?pageID=${this.pageID}`;

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

    /**
     * Get debug information
     */
    public debug(): void {
        logger.log('FluxLiveState:', {
            pageID: this.pageID,
            className: this.className,
            fields: this.getChangedFields(),
            fieldCount: this.fields.size
        });
    }
}

export default FluxLiveState;
