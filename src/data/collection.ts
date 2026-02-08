import { Emitter } from "../core/emitter";
import { fetchJson, FetchOptions } from "../core/fetch";
import { DisposeFn, Scope } from "../core/scope";
import { startSequentialRefresh } from "../refresh/sequentialRefresh";

export class Collection<T> {
    private items: T[] = [];
    private emitter = new Emitter();
    private destroyed = false;

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

    add(...items: T[]): void {
        this.checkDestroyed();
        this.items.push(...items);
        this.emitter.emit("add", items);
    }

    remove(
        predicate: (item: T, index: number) => boolean
    ): T[] {
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

        if (index < 0 || index >= this.items.length) {
            return undefined;
        }

        const [item] = this.items.splice(index, 1);
        this.emitter.emit("remove", [item]);
        return item;
    }

    find(
        predicate: (item: T, index: number) => boolean
    ): T | undefined {
        this.checkDestroyed();
        return this.items.find(predicate);
    }

    findIndex(
        predicate: (item: T, index: number) => boolean
    ): number {
        this.checkDestroyed();
        return this.items.findIndex(predicate);
    }

    filter(
        predicate: (item: T, index: number) => boolean
    ): T[] {
        this.checkDestroyed();
        return this.items.filter(predicate);
    }

    map<U>(fn: (item: T, index: number) => U): U[] {
        this.checkDestroyed();
        return this.items.map(fn);
    }

    forEach(
        fn: (item: T, index: number) => void
    ): void {
        this.checkDestroyed();
        this.items.forEach(fn);
    }

    some(
        predicate: (item: T, index: number) => boolean
    ): boolean {
        this.checkDestroyed();
        return this.items.some(predicate);
    }

    every(
        predicate: (item: T, index: number) => boolean
    ): boolean {
        this.checkDestroyed();
        return this.items.every(predicate);
    }

    sort(compareFn?: (a: T, b: T) => number): void {
        this.checkDestroyed();
        this.items.sort(compareFn);
        this.emitter.emit("sort");
    }

    reset(items: T[]): void {
        this.checkDestroyed();
        this.items = [...items];
        this.emitter.emit("reset", this.items);
    }

    clear(): void {
        this.checkDestroyed();
        if (this.items.length > 0) {
            this.items = [];
            this.emitter.emit("reset", []);
        }
    }

    async fetch(
        url: string,
        options?: FetchOptions<T[]>
    ): Promise<T[]> {
        this.checkDestroyed();

        const items = await fetchJson(url, options);
        this.reset(items);
        return this.getAll();
    }

    onAdd(
        fn: (items: T[]) => void,
        scope?: Scope
    ): DisposeFn {
        this.checkDestroyed();
        return this.emitter.on("add", fn, scope);
    }

    onRemove(
        fn: (items: T[]) => void,
        scope?: Scope
    ): DisposeFn {
        this.checkDestroyed();
        return this.emitter.on("remove", fn, scope);
    }

    onReset(
        fn: (items: T[]) => void,
        scope?: Scope
    ): DisposeFn {
        this.checkDestroyed();
        return this.emitter.on("reset", fn, scope);
    }

    onSort(
        fn: () => void,
        scope?: Scope
    ): DisposeFn {
        this.checkDestroyed();
        return this.emitter.on("sort", fn, scope);
    }

    onChange(fn: () => void, scope?: Scope): DisposeFn {
        this.checkDestroyed();

        const c1 = this.onAdd(fn, scope);
        const c2 = this.onRemove(fn, scope);
        const c3 = this.onReset(fn, scope);
        const c4 = this.onSort(fn, scope);

        return () => {
            c1();
            c2();
            c3();
            c4();
        };
    }

    autoRefresh(
        url: string,
        opts: {
            interval: number;
            scope: Scope;
            immediate?: boolean;
            fetch?: FetchOptions<T[]>;
        }
    ): DisposeFn {
        this.checkDestroyed();

        return startSequentialRefresh(
            () =>
                this.fetch(url, {
                    ...opts.fetch,
                    scope: opts.scope
                }),
            opts
        );
    }

    destroy(): void {
        if (this.destroyed) return;
        this.destroyed = true;
        this.items = [];
        this.emitter.clear();
    }

    isDestroyed(): boolean {
        return this.destroyed;
    }

    private checkDestroyed(): void {
        if (this.destroyed) {
            throw new Error(
                "[Collection] Cannot use destroyed collection"
            );
        }
    }
}
