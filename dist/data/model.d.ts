import { DisposeFn, Scope } from "../core/scope";
import { FetchOptions } from "../core/fetch";
export declare class Model<T extends object> {
    private data;
    private initial;
    private emitter;
    private destroyed;
    constructor(initial: T);
    get<K extends keyof T>(key: K): T[K];
    getAll(): T;
    set(patch: Partial<T>): boolean;
    reset(): void;
    has<K extends keyof T>(key: K, value: T[K]): boolean;
    onChange(fn: (patch: Partial<T>) => void, scope?: Scope): DisposeFn;
    fetch(url: string, options?: FetchOptions<Partial<T>>): Promise<T>;
    autoRefresh(url: string, options: {
        interval: number;
        scope: Scope;
        immediate?: boolean;
        fetch?: FetchOptions<Partial<T>>;
    }): DisposeFn;
    destroy(): void;
    isDestroyed(): boolean;
    private checkDestroyed;
}
