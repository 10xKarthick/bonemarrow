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

import {Scope} from "../types/index";

// ─────────────────────────────────────────────────────────────────────────────
// BoneMarrow Elements v1.2
//
// Lightweight fluent DOM wrapper. Import from "bonemarrow/elements".
//
// Mutating methods return `this` for chaining.
// Reading methods return values.
// All methods are safe on empty collections — they no-op silently.
// ─────────────────────────────────────────────────────────────────────────────

export class Elements {
    private readonly _nodes: Element[];

    constructor(nodes: Element[]) {
        this._nodes = nodes;
    }

    // ── Collection access ─────────────────────────────────────────────────────

    get length(): number {
        return this._nodes.length;
    }

    /**
     * Returns a shallow copy of the underlying Element array.
     * Mutations to the returned array do not affect this wrapper.
     */
    toArray(): Element[] {
        return [...this._nodes];
    }

    each(fn: (el: Element, index: number) => void): this {
        this._nodes.forEach(fn);
        return this;
    }

    get(index = 0): Element | null {
        return this._nodes[index] ?? null;
    }

    first(): Element | null {
        return this._nodes[0] ?? null;
    }

    last(): Element | null {
        return this._nodes[this._nodes.length - 1] ?? null;
    }

    // ── Traversal ─────────────────────────────────────────────────────────────

    find(selector: string): Elements {
        const out: Element[] = [];
        this.each(el => {
            out.push(...Array.from(el.querySelectorAll(selector)));
        });
        return new Elements(out);
    }

    filter(predicate: ((el: Element, index: number) => boolean) | string): Elements {
        if (typeof predicate === "string") {
            return new Elements(this._nodes.filter(el => el.matches(predicate)));
        }
        return new Elements(this._nodes.filter(predicate));
    }

    /**
     * Return elements that do NOT match the selector.
     * Inverse of filter(selector).
     */
    not(selector: string): Elements {
        return new Elements(this._nodes.filter(el => !el.matches(selector)));
    }

    parent(): Elements {
        const parents: Element[] = [];
        this.each(el => {
            if (el.parentElement) parents.push(el.parentElement);
        });
        return new Elements(parents);
    }

    /**
     * Return all sibling elements (excluding the elements themselves).
     */
    siblings(): Elements {
        const result: Element[] = [];
        this.each(el => {
            if (el.parentElement) {
                Array.from(el.parentElement.children).forEach(sibling => {
                    if (sibling !== el && !result.includes(sibling)) {
                        result.push(sibling);
                    }
                });
            }
        });
        return new Elements(result);
    }

    closest(selector: string): Elements {
        const matches: Element[] = [];
        this.each(el => {
            const match = el.closest(selector);
            if (match) matches.push(match);
        });
        return new Elements(matches);
    }

    children(): Elements {
        const children: Element[] = [];
        this.each(el => {
            children.push(...Array.from(el.children));
        });
        return new Elements(children);
    }

    // ── Content ───────────────────────────────────────────────────────────────

    /**
     * Get the text content of the first element,
     * or set text content on all elements.
     */
    text(): string;
    text(value: string): this;
    text(value?: string): string | this {
        if (value === undefined) return this.get()?.textContent ?? "";
        return this.each(el => { el.textContent = value; });
    }

    /**
     * Get the innerHTML of the first element,
     * or set innerHTML on all elements.
     *
     * ⚠️ Setting innerHTML with untrusted content is an XSS risk.
     * Sanitize before calling if content comes from user input.
     */
    html(): string;
    html(value: string): this;
    html(value?: string): string | this {
        if (value === undefined) return this.get()?.innerHTML ?? "";
        return this.each(el => { el.innerHTML = value; });
    }

    // ── Attributes ────────────────────────────────────────────────────────────

    /**
     * Get an attribute value from the first element (null if absent),
     * or set an attribute on all elements.
     *
     * Returns null (not "") when the attribute is absent — to distinguish
     * absence from an empty attribute value.
     */
    attr(name: string): string | null;
    attr(name: string, value: string): this;
    attr(name: string, value?: string): string | null | this {
        if (value === undefined) return this.get()?.getAttribute(name) ?? null;
        return this.each(el => { el.setAttribute(name, value); });
    }

    removeAttr(name: string): this {
        return this.each(el => { el.removeAttribute(name); });
    }

    /**
     * Get a data attribute value from the first element (null if absent),
     * or set a data attribute on all elements.
     *
     * Returns null (not "") when the key is absent.
     */
    data(key: string): string | null;
    data(key: string, value: string): this;
    data(key: string, value?: string): string | null | this {
        if (value === undefined) {
            const el = this.get();
            return el instanceof HTMLElement
                ? el.dataset[key] ?? null
                : null;
        }
        return this.each(el => {
            if (el instanceof HTMLElement) el.dataset[key] = value;
        });
    }

    /**
     * Get the value of the first form element,
     * or set the value on all form elements.
     * Non-form elements are silently skipped.
     */
    val(): string;
    val(value: string): this;
    val(value?: string): string | this {
        if (value === undefined) {
            const el = this.get();
            if (
                el instanceof HTMLInputElement ||
                el instanceof HTMLTextAreaElement ||
                el instanceof HTMLSelectElement
            ) {
                return el.value;
            }
            return "";
        }
        return this.each(el => {
            if (
                el instanceof HTMLInputElement ||
                el instanceof HTMLTextAreaElement ||
                el instanceof HTMLSelectElement
            ) {
                el.value = value;
            }
        });
    }

    // ── Events ────────────────────────────────────────────────────────────────

    /**
     * Add an event listener to all elements.
     *
     * If a Scope is provided, listeners are removed automatically when the
     * scope is disposed.
     *
     * ⚠️ Each element in the collection registers its own onDispose cleanup.
     * On a large collection (e.g. 100 elements), this produces 100 onDispose
     * registrations on the scope. This is correct behavior — each element
     * needs its own cleanup — not a leak. Debug mode may warn about cleanup
     * accumulation; this is a known false positive for large element sets.
     */
    on(event: string, handler: EventListener, scope?: Scope): this {
        return this.each(el => {
            el.addEventListener(event, handler);
            scope?.onDispose(() => {
                el.removeEventListener(event, handler);
            });
        });
    }

    /**
     * Add a one-time event listener to all elements.
     * The listener removes itself after firing once per element.
     */
    once(event: string, handler: EventListener): this {
        return this.each(el => {
            el.addEventListener(event, handler, { once: true });
        });
    }

    off(event: string, handler: EventListener): this {
        return this.each(el => {
            el.removeEventListener(event, handler);
        });
    }

    /**
     * Dispatch a CustomEvent on all elements.
     *
     * Defaults to bubbling and cancelable — consistent with native DOM events.
     * Pass `bubbles: false` if you explicitly need a non-bubbling event.
     */
    trigger(event: string, detail?: unknown, options?: {
        bubbles?: boolean;
        cancelable?: boolean;
    }): this {
        const { bubbles = true, cancelable = true } = options ?? {};
        return this.each(el => {
            el.dispatchEvent(new CustomEvent(event, { detail, bubbles, cancelable }));
        });
    }

    // ── Classes ───────────────────────────────────────────────────────────────

    addClass(classes: string): this {
        const classList = classes.split(" ").filter(Boolean);
        return this.each(el => { el.classList.add(...classList); });
    }

    removeClass(classes: string): this {
        const classList = classes.split(" ").filter(Boolean);
        return this.each(el => { el.classList.remove(...classList); });
    }

    toggleClass(classes: string, force?: boolean): this {
        const classList = classes.split(" ").filter(Boolean);
        return this.each(el => {
            classList.forEach(cls => { el.classList.toggle(cls, force); });
        });
    }

    hasClass(className: string): boolean {
        return this._nodes.some(el => el.classList.contains(className));
    }

    // ── Styles ────────────────────────────────────────────────────────────────

    /**
     * Get a computed style value from the first element,
     * set a CSS property on all elements,
     * or set multiple CSS properties via an object.
     */
    css(property: string): string;
    css(property: string, value: string): this;
    css(properties: Record<string, string>): this;
    css(property: string | Record<string, string>, value?: string): string | this {
        if (typeof property === "string" && value === undefined) {
            const el = this.get();
            return el instanceof HTMLElement
                ? getComputedStyle(el).getPropertyValue(property)
                : "";
        }

        if (typeof property === "string") {
            return this.each(el => {
                if (el instanceof HTMLElement) el.style.setProperty(property, value!);
            });
        }

        return this.each(el => {
            if (el instanceof HTMLElement) {
                Object.entries(property).forEach(([key, val]) => {
                    el.style.setProperty(key, val);
                });
            }
        });
    }

    show(): this {
        return this.each(el => {
            if (el instanceof HTMLElement) el.style.display = "";
        });
    }

    hide(): this {
        return this.each(el => {
            if (el instanceof HTMLElement) el.style.display = "none";
        });
    }

    toggle(show?: boolean): this {
        return this.each(el => {
            if (el instanceof HTMLElement) {
                const shouldShow = show ?? el.style.display === "none";
                el.style.display = shouldShow ? "" : "none";
            }
        });
    }

    /**
     * True if any element in the collection is visible.
     *
     * ⚠️ Uses offsetParent for visibility detection, which returns null for
     * `position: fixed` elements even when they are visible. For fixed
     * elements, check visibility manually via getBoundingClientRect() or
     * getComputedStyle().
     */
    isVisible(): boolean {
        return this._nodes.some(el => {
            if (el instanceof HTMLElement) {
                return el.style.display !== "none" && el.offsetParent !== null;
            }
            return false;
        });
    }

    // ── DOM Manipulation ──────────────────────────────────────────────────────

    /**
     * Append content to each element.
     *
     * - string → inserted as HTML via insertAdjacentHTML
     * - Elements → each child is cloned and appended
     * - Element → cloned when this wrapper has multiple targets,
     *             moved (not cloned) when there is exactly one target
     */
    append(content: Elements | Element | string): this {
        return this.each(el => {
            if (typeof content === "string") {
                el.insertAdjacentHTML("beforeend", content);
            } else if (content instanceof Elements) {
                content.each(child => el.appendChild(child.cloneNode(true)));
            } else {
                // Clone when multiple targets to avoid silently moving the
                // element out of previous targets.
                el.appendChild(
                    this._nodes.length > 1
                        ? content.cloneNode(true)
                        : content
                );
            }
        });
    }

    /**
     * Prepend content to each element.
     *
     * - string → inserted as HTML via insertAdjacentHTML
     * - Elements → each child is cloned and prepended
     * - Element → cloned when this wrapper has multiple targets,
     *             moved (not cloned) when there is exactly one target
     */
    prepend(content: Elements | Element | string): this {
        return this.each(el => {
            if (typeof content === "string") {
                el.insertAdjacentHTML("afterbegin", content);
            } else if (content instanceof Elements) {
                const first = el.firstChild;
                content.each(child => {
                    el.insertBefore(child.cloneNode(true), first);
                });
            } else {
                el.insertBefore(
                    this._nodes.length > 1
                        ? content.cloneNode(true)
                        : content,
                    el.firstChild
                );
            }
        });
    }

    remove(): this {
        return this.each(el => { el.remove(); });
    }

    empty(): this {
        return this.each(el => { el.innerHTML = ""; });
    }

    clone(deep = true): Elements {
        return new Elements(
            this._nodes.map(el => el.cloneNode(deep) as Element)
        );
    }

    // ── Focus ─────────────────────────────────────────────────────────────────

    focus(): this {
        const el = this.get();
        if (el instanceof HTMLElement) el.focus();
        return this;
    }

    blur(): this {
        const el = this.get();
        if (el instanceof HTMLElement) el.blur();
        return this;
    }
}
