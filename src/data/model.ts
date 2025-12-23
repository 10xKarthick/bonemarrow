import {Emitter} from "../core/emitter";
import {DisposeFn, Scope} from "../core/scope";
import {fetchJson, FetchOptions} from "../core/fetch";
import { startSequentialRefresh } from "../refresh/sequentialRefresh";

export class Model<T extends object> {
    private data: T;
    private emitter: Emitter = new Emitter();

    constructor(initial: T) {
        this.data = { ...initial };
    }

    get<K extends keyof T>(key: K): T[K] {
        return this.data[key];
    }

    set(patch: Partial<T>) {
        Object.assign(this.data, patch);
        this.emitter.emit('change', patch);
    }

    onChange(fn: (patch: Partial<T>) => void): DisposeFn {
        return this.emitter.on('change', fn);
    }

    async fetch(
        url: string,
        options?: FetchOptions<Partial<T>>
    ): Promise<T> {
        const patch = await fetchJson(url, options);
        this.set(patch);
        return this.data;
    }

    autoRefresh(
        url: string,
        options: {
            interval: number;
            scope: Scope;
            immediate?: boolean;
            fetch?: FetchOptions<Partial<T>>
        }
    ): DisposeFn {
        return startSequentialRefresh((): Promise<T> =>
            this.fetch(url, {...options.fetch, scope: options.scope}),
            options
        );
    }

    destroy(): void {
        this.emitter.clear();
    }
}