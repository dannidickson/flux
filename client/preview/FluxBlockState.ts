/**
 * Tracks which Flux blocks/relations are currently "open" for inline editing,
 * and notifies subscribers when that set changes.
 *
 * A block is identified by its `fx-owner` selector (e.g. `#e42`).
 * Replaces the ad-hoc `openBlocks` Set that used to live inside InlineEditor.
 */

type Listener = (event: BlockStateEvent) => void;

export interface BlockStateEvent {
    owner: string;
    open: boolean;
}

class FluxBlockState {
    private readonly open = new Set<string>();
    private readonly listeners = new Set<Listener>();

    isOpen(owner: string): boolean {
        return this.open.has(owner);
    }

    activeOwner(): string | null {
        // We currently allow only one open block at a time — the most-recently
        // opened wins. If multiple need to coexist, fan out the listeners.
        const it = this.open.values();
        let last: string | null = null;
        for (const owner of it) last = owner;
        return last;
    }

    openBlock(owner: string): void {
        // Close everything else so only one block is on the stage at a time.
        for (const existing of [...this.open]) {
            if (existing !== owner) this.closeBlock(existing);
        }

        if (this.open.has(owner)) return;
        this.open.add(owner);
        this.emit({ owner, open: true });
    }

    closeBlock(owner: string): void {
        if (!this.open.delete(owner)) return;
        this.emit({ owner, open: false });
    }

    toggle(owner: string): boolean {
        if (this.open.has(owner)) {
            this.closeBlock(owner);
            return false;
        }
        this.openBlock(owner);
        return true;
    }

    closeAll(): void {
        for (const owner of [...this.open]) this.closeBlock(owner);
    }

    subscribe(listener: Listener): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private emit(event: BlockStateEvent): void {
        for (const listener of this.listeners) listener(event);
    }
}

export const blockState = new FluxBlockState();
export type { FluxBlockState };
