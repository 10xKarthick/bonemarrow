import { TypedEmitter } from "../core/emitter";
import { fetchJson } from "../core/fetch";
import { createRootScope } from "../core/scope";
import { createRefresh } from "../core/refresh";
import { DisposeFn, RefreshController, Scope, AutoRefreshOptions } from "../types/index";

// ─────────────────────────────────────────────────────────────────────────────
// BoneMarrow Collection v1.2
//
// Reactive array with lifecycle integration.
// Import from "bonemarrow/collection", not "bonemarrow".
//
// Collection owns a Scope. When the scope is disposed, the collection is
// destroyed — listeners cleared, refresh loops stopped, fetches aborted.
// One lifecycle path, not two.
// ─────────────────────────────────────────────────────────────────────────────

type CollectionEvents<T> = {
    add:    [items: T[]];
    remove: [items: T[]];
    update: [items: T[]];
    reset:  [items: T[]];
    sort:   [];
};

export class Collection<T> {
    private items: T[] = [];
    private emitter = new TypedEmitter<CollectionEvents<T>>();
    private scope: Scope;

    /**
     * Create a collection, optionally seeded with initial items.
     *
     * @param initial - Initial items. Shallow-cloned on construction.
     * @param scope   - Scope that owns this collection. When the scope is
     *                  disposed, the collection is destroyed automatically.
     *                  If omitted, a root scope is created — you are
     *                  responsible for calling destroy() to clean up.
     *
     * ⚠️ Scope ownership: passing an external scope grants lifecycle ownership
     * to this collection. Calling destroy() disposes that scope, which affects
     * all other resources tied to it. Use a dedicated child scope per
     * collection if you need independent lifetimes:
     *   `new Collection(items, parentScope.createChild())`
     */
    constructor(initial: T[] = [], scope?: Scope) {
        this.items = [...initial];
        this.scope = scope ?? createRootScope();
        this.scope.onDispose(() => this._destroy());
    }

    // ── Read ─────────────────────────────────────────────────────────────────

    getAll(): T[] {
        this.checkDestroyed();
        return [...this.items];
    }

    get length(): number {
        this.checkDestroyed();
        return this.items.length;
    }

    at(index: number): T | undefined {
        this.checkDestroyed();
        return this.items[index];
    }

    find(predicate: (item: T, index: number) => boolean): T | undefined {
        this.checkDestroyed();
        return this.items.find(predicate);
    }

    findIndex(predicate: (item: T, index: number) => boolean): number {
        this.checkDestroyed();
        return this.items.findIndex(predicate);
    }

    filter(predicate: (item: T, index: number) => boolean): T[] {
        this.checkDestroyed();
        return this.items.filter(predicate);
    }

    map<U>(fn: (item: T, index: number) => U): U[] {
        this.checkDestroyed();
        return this.items.map(fn);
    }

    forEach(fn: (item: T, index: number) => void): void {
        this.checkDestroyed();
        this.items.forEach(fn);
    }

    some(predicate: (item: T, index: number) => boolean): boolean {
        this.checkDestroyed();
        return this.items.some(predicate);
    }

    every(predicate: (item: T, index: number) => boolean): boolean {
        this.checkDestroyed();
        return this.items.every(predicate);
    }

    // ── Write ────────────────────────────────────────────────────────────────

    add(...items: T[]): void {
        this.checkDestroyed();
        this.items.push(...items);
        this.emitter.emit("add", items);
    }

    /**
     * Remove all items matching the predicate.
     * Iterates backwards to avoid index-shift bugs during splice.
     * Returns the removed items in their original order.
     * Emits "remove" only if at least one item was removed.
     */
    remove(predicate: (item: T, index: number) => boolean): T[] {
        this.checkDestroyed();

        const removed: T[] = [];

        for (let i = this.items.length - 1; i >= 0; i--) {
            if (predicate(this.items[i], i)) {
                removed.unshift(this.items[i]);
                this.items.splice(i, 1);
            }
        }

        if (removed.length > 0) {
            this.emitter.emit("remove", removed);
        }

        return removed;
    }

    removeAt(index: number): T | undefined {
        this.checkDestroyed();

        if (index < 0 || index >= this.items.length) return undefined;

        const [item] = this.items.splice(index, 1);
        this.emitter.emit("remove", [item]);
        return item;
    }

    /**
     * Apply a shallow patch to all items matching the predicate.
     * Only items that actually change are included in the "update" emission.
     *
     * Patch is applied shallowly — consistent with Model.set() semantics.
     * Returns the items that were updated.
     *
     * @example
     * collection.update(
     *   (user) => user.id === 42,
     *   { name: "Alice" }
     * );
     */
    update(
        predicate: (item: T, index: number) => boolean,
        patch: Partial<T>
    ): T[] {
        this.checkDestroyed();

        const updated: T[] = [];

        for (let i = 0; i < this.items.length; i++) {
            if (predicate(this.items[i], i)) {
                const next = { ...this.items[i], ...patch };
                // Only update if at least one key actually changed.
                const changed = (Object.keys(patch) as Array<keyof T>).some(
                    (key) => patch[key] !== this.items[i][key]
                );
                if (changed) {
                    this.items[i] = next;
                    updated.push(next);
                }
            }
        }

        if (updated.length > 0) {
            this.emitter.emit("update", updated);
        }

        return updated;
    }

    /**
     * Move an item from one index to another.
     * Emits "sort" to signal an ordering change.
     * No-op if either index is out of bounds or indices are equal.
     */
    move(fromIndex: number, toIndex: number): void {
        this.checkDestroyed();

        if (
            fromIndex === toIndex ||
            fromIndex < 0 || fromIndex >= this.items.length ||
            toIndex   < 0 || toIndex   >= this.items.length
        ) return;

        const [item] = this.items.splice(fromIndex, 1);
        this.items.splice(toIndex, 0, item);
        this.emitter.emit("sort");
    }

    sort(compareFn?: (a: T, b: T) => number): void {
        this.checkDestroyed();
        this.items.sort(compareFn);
        this.emitter.emit("sort");
    }

    /**
     * Replace all items. Emits "reset" with the new item list.
     */
    reset(items: T[]): void {
        this.checkDestroyed();
        this.items = [...items];
        this.emitter.emit("reset", [...this.items]);
    }

    /**
     * Remove all items. No-op if already empty.
     * Emits "reset" with an empty array.
     */
    clear(): void {
        this.checkDestroyed();
        if (this.items.length > 0) {
            this.items = [];
            this.emitter.emit("reset", []);
        }
    }

    // ── Network ──────────────────────────────────────────────────────────────

    /**
     * Fetch an item array from a URL and replace the collection contents.
     * Uses the collection's own scope — aborted if the collection is destroyed.
     * Returns the full collection after reset.
     */
    async fetch(url: string, timeout?: number): Promise<T[]> {
        this.checkDestroyed();

        const items = await fetchJson<T[]>(url, {
            scope: this.scope,
            timeout,
        });

        this.reset(items);
        return this.getAll();
    }

    /**
     * Start a sequential auto-refresh loop that keeps the collection up to date.
     *
     * Returns a RefreshController — use pause(), resume(), stop() to control
     * the loop without destroying the collection.
     *
     * If no scope is provided in options, the collection's own scope owns the
     * loop — it stops automatically when the collection is destroyed.
     *
     * ⚠️ Custom scope ownership: see AutoRefreshOptions.scope for details.
     */
    autoRefresh(url: string, options: AutoRefreshOptions): RefreshController {
        this.checkDestroyed();

        const refreshScope = options.scope ?? this.scope;

        return createRefresh(
            async () => {
                if (this.isDestroyed()) return;
                const items = await fetchJson<T[]>(url, { scope: refreshScope });
                this.reset(items);
            },
            {
                interval:    options.interval,
                scope:       refreshScope,
                immediate:   options.immediate,
                startPaused: options.startPaused,
                onError:     options.onError,
                maxRetries:  options.maxRetries,
                backoff:     options.backoff,
                onDebug:     options.onDebug,
            }
        );
    }

    // ── Observe ──────────────────────────────────────────────────────────────

    onAdd(fn: (items: T[]) => void, scope?: Scope): DisposeFn {
        this.checkDestroyed();
        return this.emitter.on("add", fn, scope);
    }

    onRemove(fn: (items: T[]) => void, scope?: Scope): DisposeFn {
        this.checkDestroyed();
        return this.emitter.on("remove", fn, scope);
    }

    onUpdate(fn: (items: T[]) => void, scope?: Scope): DisposeFn {
        this.checkDestroyed();
        return this.emitter.on("update", fn, scope);
    }

    onReset(fn: (items: T[]) => void, scope?: Scope): DisposeFn {
        this.checkDestroyed();
        return this.emitter.on("reset", fn, scope);
    }

    onSort(fn: () => void, scope?: Scope): DisposeFn {
        this.checkDestroyed();
        return this.emitter.on("sort", fn, scope);
    }

    /**
     * Listen for any data change — add, remove, update, or reset.
     * Sort is intentionally excluded: sort changes ordering, not data.
     * Use onSort() separately if you need to react to ordering changes.
     *
     * Returns a single DisposeFn that removes all four listeners at once.
     */
    onChange(fn: () => void, scope?: Scope): DisposeFn {
        this.checkDestroyed();

        const c1 = this.onAdd(   () => fn(), scope);
        const c2 = this.onRemove(() => fn(), scope);
        const c3 = this.onUpdate(() => fn(), scope);
        const c4 = this.onReset( () => fn(), scope);

        return () => { c1(); c2(); c3(); c4(); };
    }

    // ── Lifecycle ────────────────────────────────────────────────────────────

    /**
     * Destroy the collection explicitly.
     * Disposes the collection's scope — stops all refresh loops, aborts
     * in-flight fetches, and clears all listeners.
     *
     * ⚠️ If a scope was passed at construction, this disposes that scope too.
     * Idempotent — safe to call multiple times.
     */
    destroy(): void {
        this.scope.dispose();
    }

    isDestroyed(): boolean {
        return this.scope.signal.aborted;
    }

    private _destroy(): void {
        this.items = [];
        this.emitter.clear();
    }

    private checkDestroyed(): void {
        if (this.isDestroyed()) {
            throw new Error("[Collection] Cannot use a destroyed collection");
        }
    }
}
