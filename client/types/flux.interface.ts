export interface FluxConfigSegment {
    Type: 'Page' | 'Element';
    ClassName: string;
    ID: string | number;
    owner?: string;
}

export interface FluxRelationFieldConfig {
    selector: string;
    actions: Array<'edit' | 'delete' | 'archive'>;
    ids: number[];
    idMap?: Record<string, string>;
    Fields: Record<string, { bind: string | null; type: string; updateMode?: FluxUpdateMode }>;
    dropZone?: string;
    sortable?: boolean;
    sortField?: string;
}

export interface GridFieldReorderMessage {
    type: 'gridFieldAction';
    key: string;
    owner: string;
    action: 'reorder';
    orderedIds: string[];
    sortField?: string;
}

export interface FluxFieldConfig {
    bind: string | null;
    type: string;
    updateMode?: FluxUpdateMode;
}

export interface FluxConfigStructure {
    Segments: FluxConfigSegment[];
    Fields: Record<string, Record<string, FluxFieldConfig>>;
    RelationFields: Record<string, Record<string, FluxRelationFieldConfig>>;
    ChangeSet: Record<string, Record<string, unknown>>;
    Events: FluxEvent[];
}

/** How a field's change is applied in the preview; absent means textUpdate. */
export type FluxUpdateMode = 'textUpdate' | 'templateUpdate' | 'patchUpdate';

export interface FluxFieldBind {
    bind: string | null;
    key: string;
    type: string;
    updateMode?: FluxUpdateMode;
}

// Host → Frame messages

export interface ConfigUpdateMessage {
    type: 'configUpdate';
    config: FluxConfigStructure;
}

/**
 * Host → frame hint telling the frame which slice of /flux/context to fetch.
 * Carries the params identifying the *currently-edited* record (which the
 * frame can't know on its own — only the CMS does).
 */
export interface ContextHintMessage {
    type: 'contextHint';
    class: string;
    id: number;
    itemID?: number | null;
    relation?: string | null;
}

export type FluxCmsMode = 'split' | 'preview' | 'edit';

export interface ModeChangeMessage {
    type: 'modeChange';
    mode: FluxCmsMode;
}

export interface PageTemplateUpdateMessage {
    type: 'pageTemplateUpdate';
    html: string;
    changedFields?: Record<string, any>;
}

export interface BlockUpdateMessage {
    type: 'blockUpdate';
    html: string;
    targetOwner: string;
}

export interface TextUpdateMessage {
    type: 'textUpdate';
    key: string;
    owner: string | null;
    event?: string | null;
    value: string;
}

export interface PatchTemplateUpdateMessage {
    type: 'patchTemplateUpdate';
    key: string;
    owner: string | null;
    value: string;
}

export interface RichTextUpdateMessage {
    type: 'richTextUpdate';
    key: string;
    owner: string | null;
    value: string;
}

export interface RichTextPatchMessage {
    type: 'richTextPatch';
    key: string;
    owner: string | null;
    value: string;
}

export type HostToFrameMessage =
    | ConfigUpdateMessage
    | ContextHintMessage
    | ModeChangeMessage
    | PageTemplateUpdateMessage
    | BlockUpdateMessage
    | TextUpdateMessage
    | PatchTemplateUpdateMessage
    | RichTextUpdateMessage
    | RichTextPatchMessage;

// Frame → Host messages

export interface InlineEditUpdateMessage {
    type: 'inlineEditUpdate';
    key: string;
    value: string;
    owner: string | null;
}

export interface FileUploadClickMessage {
    type: 'fileUploadClick';
    key: string;
    owner: string | null;
}

export interface LinkFieldClickMessage {
    type: 'linkFieldClick';
    key: string;
    owner: string | null;
}

export interface EditBlockClickMessage {
    type: 'editBlockClick';
    owner: string;
    editLink?: string | null;
    inlineEditable?: boolean;
}

export interface GridFieldActionMessage {
    type: 'gridFieldAction';
    key: string;
    owner: string;
    action: 'edit' | 'delete' | 'archive';
}

export interface DragEventEndMessage {
    type: 'dragEventEnd';
    /** The relation name (matches the GridField's name in the CMS). */
    key: string;
    /** The fx-owner of the item that was moved. */
    owner: string;
    fromIndex: number;
    toIndex: number;
    /** Full ordered list of item fx-owners after the drop. */
    orderedIds: string[];
    /** Sort-field name discovered from GridFieldOrderableRows. */
    sortField?: string;
}

export type FrameToHostMessage =
    | InlineEditUpdateMessage
    | FileUploadClickMessage
    | LinkFieldClickMessage
    | EditBlockClickMessage
    | GridFieldActionMessage
    | DragEventEndMessage;

/**
 * @deprecated Prefer the directional `HostToFrameMessage` / `FrameToHostMessage`
 * unions. Kept for any consumer that genuinely needs either direction.
 */
export type FluxBroadcastMessage = HostToFrameMessage | FrameToHostMessage;

export interface FluxEvent {
    target: string;
    event: string;
    endpoint?: string;
    method?: string;
    action?: string | (() => void);
    delay?: number;
    throttle?: number;
    replace?: "innerHTML" | "outerHTML" | InsertPosition;
}

export interface FluxRequest {
    endpoint: string;
    method: string;
}

export interface FluxChangeSetPayload {
    pageID: number;
    className: string | null;
    changeSet: Record<string, unknown>;
}

export interface FluxElementFragment {
    html: string;
    owner: string;
}

export interface FluxSegmentTemplateChanges {
    Elements: Record<string, FluxElementFragment>;
}

/** An element whose region the server couldn't find in the rendered page. */
export interface FluxSpliceMiss {
    id: string;
    tried: string[];
}

export interface FluxPageUpdateResponse {
    html: string;
    trusted?: boolean;
    changedFields?: Record<string, unknown>;
    segmentTemplateChanges?: FluxSegmentTemplateChanges;
    spliceMisses?: FluxSpliceMiss[];
}

export interface FluxBlockUpdateResponse {
    html: string;
    trusted?: boolean;
}

export interface FluxPatchUpdateResponse {
    key: string;
    owner: string | null;
    html: string;
}

/** Chunked save request: list of records to persist in a single transaction. */
export interface FluxChunkedSaveChunk {
    kind: 'DataObject' | 'Element' | 'Page';
    class: string;
    id: number;
    fields: Record<string, unknown>;
}

export interface FluxChunkedSavePayload {
    context: { pageId: number | null; pageClass: string | null };
    chunks: FluxChunkedSaveChunk[];
}

/** Per-chunk result: what was saved or what error occurred. */
export interface FluxChunkedSaveChunkResult {
    kind: 'DataObject' | 'Element' | 'Page' | 'transaction';
    class?: string;
    id?: number;
    error?: string;
}

export interface FluxChunkedSaveResponse {
    ok: boolean;
    saved: FluxChunkedSaveChunkResult[];
    errors: FluxChunkedSaveChunkResult[];
}

export interface JQueryResult {
    on(eventType: string, handler: (this: unknown, event: Event, data?: unknown) => void): JQueryResult;
    off(eventType?: string): JQueryResult;
    find(selector: string): JQueryResult;
    closest(selector: string): JQueryResult;
}

/** jQuery-like object callable as a selector, carrying the Silverstripe entwine extension. */
export interface JQueryElement extends JQueryResult {
    (selector: string | Document): JQueryResult;
    entwine(namespace: string, callback: (context: JQueryElement) => void): JQueryResult;
}

/** TinyMCE editor instance. */
export interface TinyMCEEditor {
    id: string;
    getContent(): string;
    getBody(): HTMLElement;
    hasFocus(): boolean;
    on(eventType: string, callback: (e: Event) => void): void;
    off(eventType: string): void;
}

declare global {
    interface Window {
        FluxConfig?: FluxConfigStructure;
        tinymce?: {
            get(id: string): TinyMCEEditor | undefined;
        };
    }
}
