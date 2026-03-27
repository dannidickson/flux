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
    Fields: Record<string, { bind: string; type: string }>;
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

export interface FluxBroadCastMessage {
    type: 'configUpdate' | 'pageTemplateUpdate' | 'blockUpdate' | 'textUpdate' | 'patchTemplateUpdate' | 'richTextUpdate' | 'richTextPatch' | 'inlineEditUpdate' | 'fileUploadClick' | 'editBlockClick' | 'gridFieldAction';
    html?: string;
    key?: string;
    event?: string;
    value?: string;
    owner?: string | null;
    changedFields?: Record<string, any>;
    targetKey?: string;
    targetOwner?: string;
    action?: 'edit' | 'delete' | 'archive';
}

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

export interface FluxComponentState {
    [key: string]: any;
}

export interface FluxComponentResponse {
    html: string;
    state: FluxComponentState;
    componentId: string;
}

export interface FluxComponentConfig {
    componentName: string;
    initialState?: FluxComponentState;
    rootElement?: HTMLElement;
}

export interface FluxComponentInstance {
    id: string;
    name: string;
    state: FluxComponentState;
    element: HTMLElement;
    call(method: string, params?: any[]): Promise<void>;
    refresh(): Promise<void>;
}
