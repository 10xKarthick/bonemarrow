import { FetchOptions } from "../core/fetch";
import { DisposeFn, Scope } from "../core/scope";
export declare class Collection<T> {
    private items;
    private emitter;
    private destroyed;
    getAll(): T[];
    get length(): number;
    at(index: number): T | undefined;
    add(...items: T[]): void;
    remove(predicate: (item: T, index: number) => boolean): T[];
    removeAt(index: number): T | undefined;
    find(predicate: (item: T, index: number) => boolean): T | undefined;
    findIndex(predicate: (item: T, index: number) => boolean): number;
    filter(predicate: (item: T, index: number) => boolean): T[];
    map<U>(fn: (item: T, index: number) => U): U[];
    forEach(fn: (item: T, index: number) => void): void;
    some(predicate: (item: T, index: number) => boolean): boolean;
    every(predicate: (item: T, index: number) => boolean): boolean;
    sort(compareFn?: (a: T, b: T) => number): void;
    reset(items: T[]): void;
    clear(): void;
    fetch(url: string, options?: FetchOptions<T[]>): Promise<T[]>;
    onAdd(fn: (items: T[]) => void, scope?: Scope): DisposeFn;
    onRemove(fn: (items: T[]) => void, scope?: Scope): DisposeFn;
    onReset(fn: (items: T[]) => void, scope?: Scope): DisposeFn;
    onSort(fn: () => void, scope?: Scope): DisposeFn;
    onChange(fn: () => void, scope?: Scope): DisposeFn;
    autoRefresh(url: string, opts: {
        interval: number;
        scope: Scope;
        immediate?: boolean;
        fetch?: FetchOptions<T[]>;
    }): DisposeFn;
    destroy(): void;
    isDestroyed(): boolean;
    private checkDestroyed;
}
