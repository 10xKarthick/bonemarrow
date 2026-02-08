import { createScope, Scope } from "../core/scope";
import { Elements } from "../dom/elements";
import { el } from "../dom/el";

export interface ViewOptions {
    autoDestroy?: boolean;
    parentScope?: Scope;
}

/**
 * Base View class for creating reusable UI components.
 */
export class View<T = any> {
    protected readonly scope: Scope;
    private destroyed = false;
    private children = new Set<View>();
    private options: ViewOptions;

    constructor(
        protected readonly root: Element,
        protected readonly model?: T,
        options: ViewOptions = {}
    ) {
        this.options = {
            autoDestroy: true,
            ...options
        };

        this.scope = options.parentScope
            ? options.parentScope.createChild()
            : createScope();

        if (this.options.autoDestroy) {
            this.setupAutoDestroy();
        }

        this.init();
    }

    protected init(): void {}

    protected $(selector: string): Elements {
        return el(selector, this.root);
    }

    protected $root(): Elements {
        return el(this.root);
    }

    protected createChild<U, V extends View<U>>(
        ViewClass: new (
            root: Element,
            model?: U,
            options?: ViewOptions
        ) => V,
        root: Element,
        model?: U
    ): V {
        this.checkDestroyed();

        const child = new ViewClass(root, model, {
            parentScope: this.scope,
            autoDestroy: false
        });

        this.children.add(child);

        child.scope.onDispose(() => {
            this.children.delete(child);
        });

        return child;
    }

    protected createChildren<U, V extends View<U>>(
        ViewClass: new (
            root: Element,
            model?: U,
            options?: ViewOptions
        ) => V,
        selector: string,
        modelFn?: (element: Element, index: number) => U
    ): V[] {
        this.checkDestroyed();

        const views: V[] = [];
        this.$(selector).each((element, index) => {
            const model = modelFn
                ? modelFn(element, index)
                : undefined;
            views.push(this.createChild(ViewClass, element, model));
        });

        return views;
    }

    protected emit(event: string, detail?: any): void {
        this.checkDestroyed();
        this.$root().trigger(event, detail);
    }

    protected on(event: string, handler: EventListener): void {
        this.checkDestroyed();
        this.$root().on(event, handler, this.scope);
    }

    show(): void {
        this.checkDestroyed();
        this.$root().show();
    }

    hide(): void {
        this.checkDestroyed();
        this.$root().hide();
    }

    toggle(force?: boolean): void {
        this.checkDestroyed();
        this.$root().toggle(force);
    }

    isVisible(): boolean {
        return this.$root().isVisible();
    }

    isDestroyed(): boolean {
        return this.destroyed;
    }

    getRoot(): Element {
        return this.root;
    }

    getModel(): T | undefined {
        return this.model;
    }

    destroy(): void {
        if (this.destroyed) return;
        this.destroyed = true;

        for (const child of this.children) {
            try {
                child.destroy();
            } catch (error) {
                console.error(
                    "[View] Error destroying child view:",
                    error
                );
            }
        }
        this.children.clear();

        try {
            this.scope.dispose();
        } catch (error) {
            console.error(
                "[View] Error disposing scope:",
                error
            );
        }

        if (
            this.model &&
            typeof (this.model as any).destroy === "function"
        ) {
            try {
                (this.model as any).destroy();
            } catch (error) {
                console.error(
                    "[View] Error destroying model:",
                    error
                );
            }
        }
    }

    private setupAutoDestroy(): void {
        const observer = new MutationObserver(mutations => {
            for (const mutation of mutations) {
                for (const removed of Array.from(
                    mutation.removedNodes
                )) {
                    if (
                        removed === this.root ||
                        (removed instanceof Element &&
                            removed.contains(this.root))
                    ) {
                        this.destroy();
                        observer.disconnect();
                        return;
                    }
                }
            }
        });

        if (this.root.parentElement) {
            observer.observe(this.root.parentElement, {
                childList: true,
                subtree: true
            });
        }

        this.scope.onDispose(() => {
            observer.disconnect();
        });
    }

    private checkDestroyed(): void {
        if (this.destroyed) {
            throw new Error(
                "[View] Cannot use destroyed view"
            );
        }
    }
}

/**
 * Convenience function to create a view.
 */
export function createView<T, V extends View<T>>(
    ViewClass: new (
        root: Element,
        model?: T,
        options?: ViewOptions
    ) => V,
    root: Element | string,
    model?: T,
    options?: ViewOptions
): V {
    const element =
        typeof root === "string"
            ? document.querySelector(root)
            : root;

    if (!element) {
        throw new Error(
            `[createView] Element not found: ${root}`
        );
    }

    return new ViewClass(element, model, options);
}
