import {Emitter} from "../core/emitter";
import {fetchJson, FetchOptions} from "../core/fetch";
import {DisposeFn, Scope} from "../core/scope";
import {startSequentialRefresh} from "../refresh/sequentialRefresh";

export class Collection<T> {
    items: T[] = [];
    private emitter = new Emitter();

    async fetch(
        url: string,
        options: FetchOptions<T[]>,
    ): Promise<T[]> {
        const items: T[] = await fetchJson(url, options);
        this.items = items;
        this.emitter.emit('reset', items);
        return items;
    }

    onReset(fn: (items: T[]) => void): DisposeFn {
        return this.emitter.on("reset", fn);
    }

    autoRefresh(
        url: string,
        opts: {
            interval: number;
            scope: Scope;
            immediate?: boolean;
            fetch?: FetchOptions<T[]>;
        }
    ): DisposeFn {
        return startSequentialRefresh(
            () => this.fetch(url, { ...opts.fetch, scope: opts.scope }),
            opts
        );
    }

    destroy() {
        this.items.length = 0;
        this.emitter.clear();
    }
}