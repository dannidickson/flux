interface FluxFieldBind {
    bind: string;
    key: string;
    type: string;
}

interface FluxBroadCastMessage {
    type: string;
    html?: string;
    key?: string;
    event?: string;
    value?: string;
    changedFields?: Record<string, any>;
    targetKey?: string;
}


interface FluxEvent {
    target: string;
    event: string;
    endpoint?: string;
    method?: string;
    action?: string | (() => void);
    delay?: number;
    throttle?: number;
    replace?: "innerHTML" | "outerHTML" | InsertPosition;
}

interface FluxRequest {
    endpoint: string;
    method: string;
}

interface FluxComponentState {
    [key: string]: any;
}

interface FluxComponentResponse {
    html: string;
    state: FluxComponentState;
    componentId: string;
}

interface FluxComponentConfig {
    componentName: string;
    initialState?: FluxComponentState;
    rootElement?: HTMLElement;
}

interface FluxComponentInstance {
    id: string;
    name: string;
    state: FluxComponentState;
    element: HTMLElement;
    call(method: string, params?: any[]): Promise<void>;
    refresh(): Promise<void>;
}
