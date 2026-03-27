export type FluxFieldType = 'Text' | 'HTML' | 'SingleSelectField' | 'LinkField';
export type FluxProxyType = 'previousElementSibling' | 'nextElementSibling' | 'self' | 'default';

export interface FluxDirective {
    readonly key: string;
    readonly event: string | null;
    readonly owner: string | null;
    readonly type: FluxFieldType | null;
    readonly proxySelector: string | null;
    readonly proxyType: FluxProxyType | null;
    readonly collectSelector: string | null;
    readonly element: HTMLElement;
}

export function fromElement(el: HTMLElement): FluxDirective | null {
    const key = el.getAttribute('fx-key');
    if (!key) return null;

    return {
        element: el,
        key,
        event: el.getAttribute('fx-event'),
        owner: el.getAttribute('fx-owner'),
        type: el.getAttribute('fx-type') as FluxFieldType | null,
        proxySelector: el.getAttribute('fx-proxy'),
        proxyType: el.getAttribute('fx-proxy-type') as FluxProxyType | null,
        collectSelector: el.getAttribute('fx-collect'),
    };
}

export function getElementValue(el: HTMLElement): string {
    return (el as any).value ?? el.getAttribute('value') ?? '';
}
