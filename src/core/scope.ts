export type DisposeFn = () => void;

export interface Scope {
    readonly signal: AbortSignal;
    onDispose(fn: DisposeFn): void;
    createChild(): Scope;
    dispose(): void;
}

interface InternalScope extends Scope {
    _inFlight?: Map<string, Promise<unknown>>;
}

function createScopeInternal(parent: InternalScope | null): InternalScope {
    const controller = new AbortController();
    const cleanups: DisposeFn[] = [];
    const children = new Set<InternalScope>();
    let disposed = false;

    const scope: InternalScope = {
        signal: controller.signal,

        onDispose(fn: DisposeFn): void {
            if (disposed) {
                try {
                    fn();
                } catch (error) {
                    console.error("[Scope] Error in dispose callback:", error);
                }
                return;
            }
            cleanups.push(fn);
        },

        createChild(): Scope {
            if (disposed) {
                console.warn(
                    "[Scope] Attempted to create child from disposed scope"
                );
                const deadScope = createScopeInternal(null);
                deadScope.dispose();
                return deadScope;
            }

            const child = createScopeInternal(scope);
            children.add(child);
            child.onDispose(() => children.delete(child));
            return child;
        },

        dispose(): void {
            if (disposed) return;
            disposed = true;

            // Dispose children first
            for (const child of children) {
                child.dispose();
            }
            children.clear();

            // Abort async work
            controller.abort();

            // Run cleanups (LIFO)
            for (let i = cleanups.length - 1; i >= 0; i--) {
                try {
                    cleanups[i]();
                } catch (error) {
                    console.error(
                        "[Scope] Error in cleanup function:",
                        error
                    );
                }
            }
            cleanups.length = 0;

            // Clear in-flight fetch tracking
            if (scope._inFlight) {
                scope._inFlight.clear();
                delete scope._inFlight;
            }
        }
    };

    parent?.onDispose(() => scope.dispose());
    return scope;
}

let windowScope: InternalScope | null = null;

function getWindowScope(): InternalScope {
    if (windowScope) return windowScope;

    windowScope = createScopeInternal(null);

    const disposeAll = (): void => {
        if (!windowScope) return;
        windowScope.dispose();
        windowScope = null;
    };

    window.addEventListener("pagehide", disposeAll);
    window.addEventListener("beforeunload", disposeAll);

    return windowScope;
}

/**
 * Create a new scope attached to the window scope.
 */
export function createScope(): Scope {
    return getWindowScope().createChild();
}

/**
 * Check if a scope is disposed.
 */
export function isScopeDisposed(scope: Scope): boolean {
    return scope.signal.aborted;
}
