export type DisposeFn = () => void;

export interface Scope {
    readonly signal: AbortSignal;
    onDispose(fn: DisposeFn): void;
    createChild(): Scope;
    dispose(): void;
}

interface InternalScope extends Scope {
    _inFlight? : Map<string, Promise<unknown>>;
}

function createScopeInternal(parent: InternalScope| null): InternalScope {
    const controller = new AbortController();
    const cleanups: DisposeFn[] = [];
    const children = new Set<InternalScope>;
    let disposed = false;

    const scope: InternalScope = {
        signal: controller.signal,
        onDispose(fn: DisposeFn) {
            if (disposed) {
                fn();
                return;
            }
            cleanups.push(fn);
        },
        createChild(): Scope {
            const child = createScopeInternal(scope);
            children.add(child);
            child.onDispose(() => children.delete(child));
            return child;
        },
        dispose(): void {
            if (disposed) return;
            disposed = true;

            for (const child of children) child.dispose();
            children.clear();

            controller.abort();
            for (const fn of cleanups) fn();
            cleanups.length = 0;
        }
    };

    parent?.onDispose(() => scope.dispose());
    return scope;
}

let windowScope: InternalScope | null = null;

function getWindowScope(): InternalScope {
    if (windowScope) return windowScope;

    windowScope = createScopeInternal(null);

    const disposeAll = () =>  windowScope?.dispose();
    window.addEventListener("pagehide", disposeAll);
    window.addEventListener("beforeunload", disposeAll);

    return windowScope;
}

export function createScope(): Scope {
    return getWindowScope().createChild();
}