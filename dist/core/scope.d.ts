export type DisposeFn = () => void;
export interface Scope {
    readonly signal: AbortSignal;
    onDispose(fn: DisposeFn): void;
    createChild(): Scope;
    dispose(): void;
}
/**
 * Create a new scope attached to the window scope.
 */
export declare function createScope(): Scope;
/**
 * Check if a scope is disposed.
 */
export declare function isScopeDisposed(scope: Scope): boolean;
