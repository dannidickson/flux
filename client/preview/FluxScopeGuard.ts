/**
 * Decides whether a Flux-bound element is editable for the current scope.
 *
 * Scope is set by the host via window.FluxScope (initialised by
 * FluxBootstrap.applyContext).
 *
 *  page          → every fx-* element is editable
 *  block         → only elements whose nearest fx-owner ancestor matches
 *                  scope.ownerId
 *  relation-item → only elements whose owner equals scope.ownerId
 */

import type { FluxScope } from "../cms-live-updates/FluxBootstrap";

export class FluxScopeGuard {
    private readonly scope: FluxScope;

    constructor(scope?: FluxScope | null) {
        this.scope = scope ?? window.FluxScope ?? { kind: "page", ownerId: null };
    }

    static current(): FluxScopeGuard {
        return new FluxScopeGuard();
    }

    get kind(): FluxScope["kind"] {
        return this.scope.kind;
    }

    /**
     * True if the given fx-* element is in-scope for the current edit context.
     * Pass the element itself, not its owner — we resolve the nearest
     * fx-owner ancestor or the element's own fx-owner attribute.
     */
    canEdit(element: Element): boolean {
        if (this.scope.kind === "page") {
            return true;
        }

        const elementOwner = this.resolveOwner(element);
        if (!elementOwner) {
            return false;
        }

        return elementOwner === this.scope.ownerId;
    }

    private resolveOwner(element: Element): string | null {
        const own = element.getAttribute("fx-owner");
        if (own) return own;

        const ancestor = element.closest("[fx-owner]");
        return ancestor?.getAttribute("fx-owner") ?? null;
    }
}
