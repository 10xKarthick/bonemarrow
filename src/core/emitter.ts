import { DisposeFn, Scope } from "./scope";

/**
 * Type-safe event emitter with automatic cleanup and error isolation.
 *
 * @example
 * type Events = {
 *   change: [data: string];
 *   reset: [];
 * };
 *
 * const emitter = new TypedEmitter<Events>();
 * emitter.on("change", (data) => {
 *   console.log(data); // data is string
 * });
 */
export class TypedEmitter<TEvents extends Record<string, unknown[]>> {
    private events = new Map<keyof TEvents, Set<(...args: any[]) => void>>();
    private debugMode = false;

    constructor(options?: { debug?: boolean }) {
        this.debugMode = options?.debug ?? false;
    }

    /**
     * Register an event listener.
     */
    on<K extends keyof TEvents>(
        event: K,
        fn: (...args: TEvents[K]) => void,
        scope?: Scope
    ): DisposeFn {
        let set = this.events.get(event);
        if (!set) {
            set = new Set();
            this.events.set(event, set);
        }

        set.add(fn);

        if (this.debugMode) {
            console.log(
                `[Emitter] Listener added for "${String(event)}" (total: ${set.size})`
            );
        }

        let disposed = false;

        const cleanup = () => {
            if (disposed) return;
            disposed = true;

            set!.delete(fn);

            if (set!.size === 0) {
                this.events.delete(event);
            }

            if (this.debugMode) {
                console.log(
                    `[Emitter] Listener removed for "${String(event)}" (remaining: ${set!.size})`
                );
            }
        };

        scope?.onDispose(cleanup);
        return cleanup;
    }

    /**
     * Register a one-time event listener.
     */
    once<K extends keyof TEvents>(
        event: K,
        fn: (...args: TEvents[K]) => void,
        scope?: Scope
    ): DisposeFn {
        const wrapper = (...args: TEvents[K]) => {
            cleanup();
            fn(...args);
        };

        const cleanup = this.on(event, wrapper, scope);
        return cleanup;
    }

    /**
     * Emit an event to all registered listeners.
     * Errors are isolated per handler.
     */
    emit<K extends keyof TEvents>(event: K, ...args: TEvents[K]): void {
        const handlers = this.events.get(event);

        if (!handlers || handlers.size === 0) {
            if (this.debugMode) {
                console.log(`[Emitter] No listeners for "${String(event)}"`);
            }
            return;
        }

        if (this.debugMode) {
            console.log(
                `[Emitter] Emitting "${String(event)}" to ${handlers.size} listener(s)`
            );
        }

        // Snapshot to avoid mutation issues
        const handlersArray = Array.from(handlers);

        for (const fn of handlersArray) {
            try {
                fn(...args);
            } catch (error) {
                console.error(
                    `[Emitter] Error in handler for "${String(event)}":`,
                    error
                );
            }
        }
    }

    /**
     * Remove all listeners for a specific event.
     */
    off<K extends keyof TEvents>(event: K): void {
        const deleted = this.events.delete(event);

        if (this.debugMode && deleted) {
            console.log(
                `[Emitter] All listeners removed for "${String(event)}"`
            );
        }
    }

    /**
     * Remove all listeners for all events.
     */
    clear(): void {
        const count = this.events.size;
        this.events.clear();

        if (this.debugMode && count > 0) {
            console.log(
                `[Emitter] Cleared all listeners for ${count} event(s)`
            );
        }
    }

    hasListeners<K extends keyof TEvents>(event: K): boolean {
        return (this.events.get(event)?.size ?? 0) > 0;
    }

    listenerCount<K extends keyof TEvents>(event: K): number {
        return this.events.get(event)?.size ?? 0;
    }

    eventNames(): Array<keyof TEvents> {
        return Array.from(this.events.keys());
    }

    setDebug(enabled: boolean): void {
        this.debugMode = enabled;
    }
}

/**
 * Simple untyped emitter for cases where type safety isn’t needed.
 * Prefer TypedEmitter when possible.
 */
export class Emitter {
    private events = new Map<string, Set<(...args: any[]) => void>>();

    on(
        event: string,
        fn: (...args: any[]) => void,
        scope?: Scope
    ): DisposeFn {
        let set = this.events.get(event);
        if (!set) {
            set = new Set();
            this.events.set(event, set);
        }

        set.add(fn);

        let disposed = false;

        const cleanup = () => {
            if (disposed) return;
            disposed = true;

            set!.delete(fn);

            if (set!.size === 0) {
                this.events.delete(event);
            }
        };

        scope?.onDispose(cleanup);
        return cleanup;
    }

    once(
        event: string,
        fn: (...args: unknown[]) => void,
        scope?: Scope
    ): DisposeFn {
        const wrapper = (...args: unknown[]) => {
            cleanup();
            fn(...args);
        };

        const cleanup = this.on(event, wrapper, scope);
        return cleanup;
    }

    emit(event: string, ...args: unknown[]): void {
        const handlers = this.events.get(event);
        if (!handlers || handlers.size === 0) return;

        const handlersArray = Array.from(handlers);

        for (const fn of handlersArray) {
            try {
                fn(...args);
            } catch (error) {
                console.error(
                    `Error in event handler for "${event}":`,
                    error
                );
            }
        }
    }

    off(event: string): void {
        this.events.delete(event);
    }

    clear(): void {
        this.events.clear();
    }

    hasListeners(event: string): boolean {
        return (this.events.get(event)?.size ?? 0) > 0;
    }

    listenerCount(event: string): number {
        return this.events.get(event)?.size ?? 0;
    }

    eventNames(): string[] {
        return Array.from(this.events.keys());
    }
}
