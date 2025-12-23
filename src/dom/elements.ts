import { Scope } from "../core/scope";

export class Elements {
    constructor(public readonly nodes: Element[]) {}

    each(fn: (el: Element, index: number) => void): this {
        this.nodes.forEach(fn);
        return this;
    }

    get(index = 0): Element | null {
        return this.nodes[index] ?? null;
    }

    find(selector: string): Elements {
        const out: Element[] = [];
        this.each((el: Element): void => {
            out.push(...Array.from(el.querySelectorAll(selector)));
        });
        return new Elements(out);
    }

    on(
        event: string,
        handler: EventListener,
        scope?: Scope
    ): this {
        return this.each((el: Element): void => {
            el.addEventListener(event, handler);
            scope?.onDispose((): any =>
                el.removeEventListener(event, handler)
            );
        });
    }

    text(value?: string): string | this {
        if (value === undefined) {
            return this.get()?.textContent ?? "";
        }
        return this.each((el: Element): string => (el.textContent = value));
    }

    addClass(cls: string): this {
        return this.each((el: Element): void => el.classList.add(cls));
    }

    removeClass(cls: string): this {
        return this.each((el: Element): void => el.classList.remove(cls));
    }
}
