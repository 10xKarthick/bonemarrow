import { Emitter } from "../core/emitter";
import { DisposeFn, Scope } from "../core/scope";
import { fetchJson, FetchOptions } from "../core/fetch";
import { startSequentialRefresh } from "../refresh/sequentialRefresh";

export class Model<T extends object> {
    private data: T;
    private initial: T;
    private emitter = new Emitter();
    private destroyed = false;

    constructor(initial: T) {
        this.initial = { ...initial };
        this.data = { ...initial };
    }

    get<K extends keyof T>(key: K): T[K] {
        this.checkDestroyed();
        return this.data[key];
    }

    getAll(): T {
        this.checkDestroyed();
        return { ...this.data };
    }

    set(patch: Partial<T>): boolean {
        this.checkDestroyed();

        const changes: Partial<T> = {};
        let hasChanges = false;

        for (const key of Object.keys(patch) as Array<keyof T>) {
            if (patch[key] !== this.data[key]) {
                changes[key] = patch[key];
                hasChanges = true;
            }
        }

        if (!hasChanges) {
            return false;
        }

        Object.assign(this.data, changes);
        this.emitter.emit("change", changes);
        return true;
    }

    reset(): void {
        this.checkDestroyed();

        const resetData = { ...this.initial };
        const hasChanges = Object.keys(resetData).some(
            key =>
                resetData[key as keyof T] !==
                this.data[key as keyof T]
        );

        if (hasChanges) {
            this.data = resetData;
            this.emitter.emit("change", resetData);
        }
    }

    has<K extends keyof T>(key: K, value: T[K]): boolean {
        this.checkDestroyed();
        return this.data[key] === value;
    }

    onChange(
        fn: (patch: Partial<T>) => void,
        scope?: Scope
    ): DisposeFn {
        this.checkDestroyed();
        return this.emitter.on("change", fn, scope);
    }

    async fetch(
        url: string,
        options?: FetchOptions<Partial<T>>
    ): Promise<T> {
        this.checkDestroyed();

        const patch = await fetchJson(url, options);
        this.set(patch);
        return this.getAll();
    }

    autoRefresh(
        url: string,
        options: {
            interval: number;
            scope: Scope;
            immediate?: boolean;
            fetch?: FetchOptions<Partial<T>>;
        }
    ): DisposeFn {
        this.checkDestroyed();

        return startSequentialRefresh(
            () =>
                this.fetch(url, {
                    ...options.fetch,
                    scope: options.scope
                }),
            options
        );
    }

    destroy(): void {
        if (this.destroyed) return;
        this.destroyed = true;
        this.emitter.clear();
    }

    isDestroyed(): boolean {
        return this.destroyed;
    }

    private checkDestroyed(): void {
        if (this.destroyed) {
            throw new Error("[Model] Cannot use destroyed model");
        }
    }
}
