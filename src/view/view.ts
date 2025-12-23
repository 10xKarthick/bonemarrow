import { createScope, Scope } from "../core/scope";
import { Elements } from "../dom/elements";
import { el } from "../dom/el";

export class View<T> {
    protected readonly scope: Scope;

    constructor(
        protected readonly root: Element,
        protected readonly model: T
    ) {
        this.scope = createScope();
        this.init();
    }

    protected init(): void {}

    protected $(selector: string): Elements {
        return el(selector, this.root);
    }

    destroy(): void {
        this.scope.dispose();
        (this.model as any)?.destroy?.();
    }
}
