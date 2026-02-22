/*
 * BoneMarrow
 * Copyright (c) 2025-present Karthick Raj
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 */

import {createScope} from "../core/scope";
import {Elements} from "../dom/elements";
import {el} from "../dom/el";
import {Scope, ViewOptions} from "../types/index";

// ─────────────────────────────────────────────────────────────────────────────
// BoneMarrow View v1.2
//
// Base class for UI components. Composes Scope, Elements, and the lifecycle
// primitives into a reusable component model.
//
// Import from "bonemarrow/view", not "bonemarrow".
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Base class for BoneMarrow UI components.
 *
 * Lifecycle:
 * 1. `constructor` → sets up scope, calls `init()`
 * 2. `init()` → override to wire events, create children, bind model
 * 3. `render()` → override to update DOM from model state
 * 4. `destroy()` → disposes scope, which cascades to all children
 *
 * Model lifecycle:
 * View does not automatically destroy the model. Wire it yourself in init()
 * if you want the model to die with the view:
 *   `this.scope.onDispose(() => this.model.destroy())`
 * Or pass the view's scope to the model at construction:
 *   `new Model(data, this.scope)`
 *
 * @example
 * class CardView extends View<CardModel> {
 *   protected init() {
 *     this.$(".title").text(this.model?.get("title") ?? "");
 *     this.on("click", () => this.emit("selected", this.model));
 *   }
 *
 *   protected render() {
 *     this.$(".title").text(this.model?.get("title") ?? "");
 *   }
 * }
 */
export class View<T = unknown> {
    protected readonly scope: Scope;
    private readonly _children = new Set<View>();

    constructor(
        protected readonly root: Element,
        protected readonly model?: T,
        options: ViewOptions = {}
    ) {
        const { autoDestroy = true, parentScope } = options;

        this.scope = parentScope
            ? parentScope.createChild()
            : createScope();

        // Clean up child tracking when a child self-disposes.
        // Scope tree already handles propagating disposal to children —
        // this just keeps _children set tidy.
        this.scope.onDispose(() => {
            this._children.clear();
        });

        if (autoDestroy) {
            this._setupAutoDestroy();
        }

        this.init();
    }

    // ── Lifecycle hooks ───────────────────────────────────────────────────────

    /**
     * Called once during construction after scope is set up.
     * Override to wire events, create children, bind model.
     */
    protected init(): void {}

    /**
     * Override to update DOM from current model state.
     * Not called automatically — invoke manually or wire via onChange:
     *   `this.model.onChange(() => this.render(), this.scope)`
     */
    protected render(): void {}

    // ── DOM helpers ───────────────────────────────────────────────────────────

    /** Query within the view's root element. */
    protected $(selector: string): Elements {
        return el(selector, this.root);
    }

    /** Wrap the view's root element. */
    protected $root(): Elements {
        return el(this.root);
    }

    /** Focus the view's root element. */
    focus(): this {
        const r = this.root;
        if (r instanceof HTMLElement) r.focus();
        return this;
    }

    // ── Events ────────────────────────────────────────────────────────────────

    /**
     * Bind an event listener to the view's root element.
     * Automatically removed when the view's scope is disposed.
     */
    protected on(event: string, handler: EventListener): void {
        this.checkDestroyed();
        this.$root().on(event, handler, this.scope);
    }

    /**
     * Bind an event listener to `document`.
     * Automatically removed when the view's scope is disposed.
     * Use for global keyboard shortcuts, clicks outside, etc.
     */
    protected onDocument(event: string, handler: EventListener): void {
        this.checkDestroyed();
        document.addEventListener(event, handler);
        this.scope.onDispose(() => document.removeEventListener(event, handler));
    }

    /**
     * Bind an event listener to `window`.
     * Automatically removed when the view's scope is disposed.
     * Use for resize, scroll, hashchange, etc.
     */
    protected onWindow(event: string, handler: EventListener): void {
        this.checkDestroyed();
        window.addEventListener(event, handler);
        this.scope.onDispose(() => window.removeEventListener(event, handler));
    }

    /**
     * Dispatch a CustomEvent from the view's root element.
     * Bubbles and is cancelable by default — consistent with native DOM events.
     */
    protected emit(event: string, detail?: unknown): void {
        this.checkDestroyed();
        this.$root().trigger(event, detail);
    }

    // ── Children ──────────────────────────────────────────────────────────────

    /**
     * Create a child view owned by this view's scope.
     * The child is destroyed automatically when this view is destroyed.
     *
     * @example
     * const header = this.createChild(HeaderView, this.$(".header").get()!);
     */
    protected createChild<U, V extends View<U>>(
        ViewClass: new (root: Element, model?: U, options?: ViewOptions) => V,
        root: Element,
        model?: U
    ): V {
        this.checkDestroyed();

        const child = new ViewClass(root, model, {
            parentScope: this.scope,
            autoDestroy: false,
        });

        this._children.add(child);

        // Remove from tracking when child self-disposes independently.
        child.scope.onDispose(() => this._children.delete(child));

        return child;
    }

    /**
     * Create child views for each element matching a selector.
     * An optional modelFn maps each element to a model instance.
     */
    protected createChildren<U, V extends View<U>>(
        ViewClass: new (root: Element, model?: U, options?: ViewOptions) => V,
        selector: string,
        modelFn?: (element: Element, index: number) => U
    ): V[] {
        this.checkDestroyed();

        const views: V[] = [];
        this.$(selector).each((element, index) => {
            const model = modelFn ? modelFn(element, index) : undefined;
            views.push(this.createChild(ViewClass, element, model));
        });

        return views;
    }

    // ── Visibility ────────────────────────────────────────────────────────────

    show(): this {
        this.checkDestroyed();
        this.$root().show();
        return this;
    }

    hide(): this {
        this.checkDestroyed();
        this.$root().hide();
        return this;
    }

    toggle(force?: boolean): this {
        this.checkDestroyed();
        this.$root().toggle(force);
        return this;
    }

    isVisible(): boolean {
        return this.$root().isVisible();
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    /**
     * Destroy this view.
     * Disposes the view's scope, which cascades to all child views via the
     * scope tree. No manual child iteration needed.
     *
     * Idempotent — safe to call multiple times.
     */
    destroy(): void {
        this.scope.dispose();
    }

    /**
     * True if this view has been destroyed.
     */
    isDestroyed(): boolean {
        return this.scope.signal.aborted;
    }

    getRoot(): Element {
        return this.root;
    }

    getModel(): T | undefined {
        return this.model;
    }

    private _setupAutoDestroy(): void {
        if (!this.root.parentElement) {
            console.warn(
                "[View] autoDestroy is enabled but root has no parentElement. " +
                "The MutationObserver cannot attach. Ensure root is in the DOM " +
                "before constructing the view, or disable autoDestroy."
            );
            return;
        }

        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                for (const removed of Array.from(mutation.removedNodes)) {
                    if (
                        removed === this.root ||
                        (removed instanceof Element && removed.contains(this.root))
                    ) {
                        this.destroy();
                        observer.disconnect();
                        return;
                    }
                }
            }
        });

        observer.observe(this.root.parentElement, {
            childList: true,
            subtree: true,
        });

        // Disconnect when scope disposes — prevents observer from firing
        // after the view is already destroyed by other means.
        this.scope.onDispose(() => observer.disconnect());
    }

    private checkDestroyed(): void {
        if (this.isDestroyed()) {
            throw new Error("[View] Cannot use a destroyed view");
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a view from a CSS selector string or Element.
 *
 * @throws If the selector matches no element.
 * @throws If called outside a browser environment.
 *
 * @example
 * const card = createView(CardView, "#card", model);
 */
export function createView<T, V extends View<T>>(
    ViewClass: new (root: Element, model?: T, options?: ViewOptions) => V,
    root: Element | string,
    model?: T,
    options?: ViewOptions
): V {
    if (typeof document === "undefined") {
        throw new Error(
            "[createView] DOM is not available in this environment. " +
            "createView() requires a browser context."
        );
    }

    const element = typeof root === "string"
        ? document.querySelector(root)
        : root;

    if (!element) {
        throw new Error(`[createView] Element not found: ${root}`);
    }

    return new ViewClass(element, model, options);
}
