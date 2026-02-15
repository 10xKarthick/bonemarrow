import { Scope } from "./scope";
export interface FetchOptions<T> {
    scope?: Scope;
    abort?: boolean;
    timeout?: number;
    retryOnFailure?: number;
    retryDelay?: number;
    dedupe?: boolean;
    init?: RequestInit;
    parse?: (json: unknown) => T;
}
export declare function fetchJson<T>(url: string, options?: FetchOptions<T>): Promise<T>;
