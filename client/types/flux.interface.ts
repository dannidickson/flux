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
    Fields: Record<string, { bind: string; type: string }>;
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

export interface FluxConfigStructure {
    Segments: FluxConfigSegment[];
    Fields: Record<string, Record<string, any>>;
    RelationFields: Record<string, Record<string, FluxRelationFieldConfig>>;
    ChangeSet: Record<string, Record<string, any>>;
    Events: any[];
}

export interface FluxFieldBind {
    bind: string;
    key: string;
    type: string;
}

// ---------- Host → Frame messages ----------

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

// ---------- Frame → Host messages ----------

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

export interface FluxSegmentTemplateChanges {
    Elements: Record<string, string>;
}

export interface FluxPageUpdateResponse {
    html: string;
    trusted?: boolean;
    changedFields?: Record<string, unknown>;
    segmentTemplateChanges?: FluxSegmentTemplateChanges;
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

declare global {
    interface Window {
        FluxConfig?: FluxConfigStructure;
    }
}
