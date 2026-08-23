import type {
    FluxBlockUpdateResponse,
    FluxChangeSetPayload,
    FluxChunkedSavePayload,
    FluxChunkedSaveResponse,
    FluxPageUpdateResponse,
    FluxPatchUpdateResponse,
} from "../types/flux.interface";

async function postJson<T>(url: string, body: unknown, errorLabel: string): Promise<T> {
    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        throw new Error(`${errorLabel} failed: ${response.statusText}`);
    }

    return response.json() as Promise<T>;
}

export default class FluxApiClient {
    constructor(private readonly apiEndpoint: string) {}

    sendPageUpdate(payload: FluxChangeSetPayload): Promise<FluxPageUpdateResponse> {
        const url = `${this.apiEndpoint}/pageTemplateUpdate?pageID=${payload.pageID}`;
        return postJson<FluxPageUpdateResponse>(url, payload, "Template update");
    }

    sendBlockUpdate(payload: FluxChangeSetPayload, owner: string): Promise<FluxBlockUpdateResponse> {
        const url = `${this.apiEndpoint}/blockUpdate?pageID=${payload.pageID}&owner=${encodeURIComponent(owner)}`;
        return postJson<FluxBlockUpdateResponse>(url, payload, "Block update");
    }

    sendPatchUpdate(key: string, value: string, owner: string | null): Promise<FluxPatchUpdateResponse> {
        const url = `${this.apiEndpoint}/shortCodesFragmentPatch`;
        return postJson<FluxPatchUpdateResponse>(url, { key, value, owner }, "Patch update");
    }

    /**
     * Persist a chunked changeset via /flux/save. Server writes in
     * DataObject → Element → Page order inside a single transaction.
     */
    async sendChunkedSave(payload: FluxChunkedSavePayload): Promise<FluxChunkedSaveResponse> {
        const response = await fetch("/flux/save", {
            method: "POST",
            credentials: "same-origin",
            headers: {
                "Content-Type": "application/json",
                "X-SecurityID": window.FluxCsrf ?? "",
            },
            body: JSON.stringify(payload),
        });

        const result = await response.json();
        return result as FluxChunkedSaveResponse;
    }
}
