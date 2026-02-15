import { Scope } from "../core/scope";
import { Elements } from "../dom/elements";
export interface ViewOptions {
    autoDestroy?: boolean;
    parentScope?: Scope;
}
/**
 * Base View class for creating reusable UI components.
 */
export declare class View<T = any> {
    protected readonly root: Element;
    protected readonly model?: T | undefined;
    protected readonly scope: Scope;
    private destroyed;
    private children;
    private options;
    constructor(root: Element, model?: T | undefined, options?: ViewOptions);
    protected init(): void;
    protected $(selector: string): Elements;
    protected $root(): Elements;
    protected createChild<U, V extends View<U>>(ViewClass: new (root: Element, model?: U, options?: ViewOptions) => V, root: Element, model?: U): V;
    protected createChildren<U, V extends View<U>>(ViewClass: new (root: Element, model?: U, options?: ViewOptions) => V, selector: string, modelFn?: (element: Element, index: number) => U): V[];
    protected emit(event: string, detail?: any): void;
    protected on(event: string, handler: EventListener): void;
    show(): void;
    hide(): void;
    toggle(force?: boolean): void;
    isVisible(): boolean;
    isDestroyed(): boolean;
    getRoot(): Element;
    getModel(): T | undefined;
    destroy(): void;
    private setupAutoDestroy;
    private checkDestroyed;
}
/**
 * Convenience function to create a view.
 */
export declare function createView<T, V extends View<T>>(ViewClass: new (root: Element, model?: T, options?: ViewOptions) => V, root: Element | string, model?: T, options?: ViewOptions): V;
