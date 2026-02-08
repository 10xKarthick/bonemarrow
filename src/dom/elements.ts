import { Scope } from "../core/scope";

export class Elements {
    constructor(public readonly nodes: Element[]) {}

    get length(): number {
        return this.nodes.length;
    }

    each(fn: (el: Element, index: number) => void): this {
        this.nodes.forEach(fn);
        return this;
    }

    get(index = 0): Element | null {
        return this.nodes[index] ?? null;
    }

    first(): Element | null {
        return this.nodes[0] ?? null;
    }

    last(): Element | null {
        return this.nodes[this.nodes.length - 1] ?? null;
    }

    find(selector: string): Elements {
        const out: Element[] = [];
        this.each(el => {
            out.push(...Array.from(el.querySelectorAll(selector)));
        });
        return new Elements(out);
    }

    filter(
        predicate: ((el: Element, index: number) => boolean) | string
    ): Elements {
        if (typeof predicate === "string") {
            return new Elements(
                this.nodes.filter(el => el.matches(predicate))
            );
        }
        return new Elements(this.nodes.filter(predicate));
    }

    parent(): Elements {
        const parents: Element[] = [];
        this.each(el => {
            if (el.parentElement) {
                parents.push(el.parentElement);
            }
        });
        return new Elements(parents);
    }

    closest(selector: string): Elements {
        const matches: Element[] = [];
        this.each(el => {
            const match = el.closest(selector);
            if (match) {
                matches.push(match);
            }
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

    text(value?: string): string | this {
        if (value === undefined) {
            return this.get()?.textContent ?? "";
        }
        return this.each(el => {
            el.textContent = value;
        });
    }

    html(value?: string): string | this {
        if (value === undefined) {
            return this.get()?.innerHTML ?? "";
        }
        return this.each(el => {
            el.innerHTML = value;
        });
    }

    attr(name: string, value?: string): string | this {
        if (value === undefined) {
            return this.get()?.getAttribute(name) ?? "";
        }
        return this.each(el => {
            el.setAttribute(name, value);
        });
    }

    removeAttr(name: string): this {
        return this.each(el => {
            el.removeAttribute(name);
        });
    }

    data(key: string, value?: string): string | this {
        if (value === undefined) {
            const el = this.get();
            return el instanceof HTMLElement
                ? el.dataset[key] ?? ""
                : "";
        }

        return this.each(el => {
            if (el instanceof HTMLElement) {
                el.dataset[key] = value;
            }
        });
    }

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

    on(
        event: string,
        handler: EventListener,
        scope?: Scope
    ): this {
        return this.each(el => {
            el.addEventListener(event, handler);
            scope?.onDispose(() => {
                el.removeEventListener(event, handler);
            });
        });
    }

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

    trigger(event: string, detail?: any): this {
        return this.each(el => {
            el.dispatchEvent(
                new CustomEvent(event, { detail })
            );
        });
    }

    addClass(classes: string): this {
        const classList = classes.split(" ").filter(Boolean);
        return this.each(el => {
            el.classList.add(...classList);
        });
    }

    removeClass(classes: string): this {
        const classList = classes.split(" ").filter(Boolean);
        return this.each(el => {
            el.classList.remove(...classList);
        });
    }

    toggleClass(classes: string, force?: boolean): this {
        const classList = classes.split(" ").filter(Boolean);
        return this.each(el => {
            classList.forEach(cls => {
                el.classList.toggle(cls, force);
            });
        });
    }

    hasClass(className: string): boolean {
        return this.nodes.some(el =>
            el.classList.contains(className)
        );
    }

    css(
        property: string | Record<string, string>,
        value?: string
    ): string | this {
        if (typeof property === "string" && value === undefined) {
            const el = this.get();
            return el instanceof HTMLElement
                ? getComputedStyle(el).getPropertyValue(property)
                : "";
        }

        if (typeof property === "string") {
            return this.each(el => {
                if (el instanceof HTMLElement) {
                    el.style.setProperty(property, value!);
                }
            });
        }

        return this.each(el => {
            if (el instanceof HTMLElement) {
                Object.entries(property).forEach(
                    ([key, val]) => {
                        el.style.setProperty(key, val);
                    }
                );
            }
        });
    }

    show(): this {
        return this.each(el => {
            if (el instanceof HTMLElement) {
                el.style.display = "";
            }
        });
    }

    hide(): this {
        return this.each(el => {
            if (el instanceof HTMLElement) {
                el.style.display = "none";
            }
        });
    }

    toggle(show?: boolean): this {
        return this.each(el => {
            if (el instanceof HTMLElement) {
                const shouldShow =
                    show ?? el.style.display === "none";
                el.style.display = shouldShow ? "" : "none";
            }
        });
    }

    isVisible(): boolean {
        return this.nodes.some(el => {
            if (el instanceof HTMLElement) {
                return (
                    el.style.display !== "none" &&
                    el.offsetParent !== null
                );
            }
            return false;
        });
    }

    append(content: Elements | Element | string): this {
        return this.each(el => {
            if (typeof content === "string") {
                el.insertAdjacentHTML("beforeend", content);
            } else if (content instanceof Elements) {
                content.each(child =>
                    el.appendChild(child.cloneNode(true))
                );
            } else {
                el.appendChild(content);
            }
        });
    }

    prepend(content: Elements | Element | string): this {
        return this.each(el => {
            if (typeof content === "string") {
                el.insertAdjacentHTML("afterbegin", content);
            } else if (content instanceof Elements) {
                const first = el.firstChild;
                content.each(child => {
                    el.insertBefore(
                        child.cloneNode(true),
                        first
                    );
                });
            } else {
                el.insertBefore(content, el.firstChild);
            }
        });
    }

    remove(): this {
        return this.each(el => {
            el.remove();
        });
    }

    empty(): this {
        return this.each(el => {
            el.innerHTML = "";
        });
    }

    clone(deep = true): Elements {
        return new Elements(
            this.nodes.map(
                el => el.cloneNode(deep) as Element
            )
        );
    }

    focus(): this {
        const el = this.get();
        if (el instanceof HTMLElement) {
            el.focus();
        }
        return this;
    }

    blur(): this {
        const el = this.get();
        if (el instanceof HTMLElement) {
            el.blur();
        }
        return this;
    }
}
