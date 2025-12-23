import {DisposeFn} from "./scope";

export class Emitter {
    private events: Map<string, Set<Function>> = new Map<string, Set<Function>>();

    on<T extends Function>(event: string, fn: T): DisposeFn {
        let set: Set<Function> = this.events.get(event)!;
        if (!set) {
            set = new Set();
            this.events.set(event, set);
        }
        set.add(fn);
        return (): boolean => set!.delete(fn);
    }

    emit(event: string, ...args: unknown[]): void {
        this.events.get(event)?.forEach((fn: Function): any => fn(...args));
    }

    clear(): void {
        this.events.clear();
    }
}