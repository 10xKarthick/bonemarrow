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
export declare class TypedEmitter<TEvents extends Record<string, unknown[]>> {
    private events;
    private debugMode;
    constructor(options?: {
        debug?: boolean;
    });
    /**
     * Register an event listener.
     */
    on<K extends keyof TEvents>(event: K, fn: (...args: TEvents[K]) => void, scope?: Scope): DisposeFn;
    /**
     * Register a one-time event listener.
     */
    once<K extends keyof TEvents>(event: K, fn: (...args: TEvents[K]) => void, scope?: Scope): DisposeFn;
    /**
     * Emit an event to all registered listeners.
     * Errors are isolated per handler.
     */
    emit<K extends keyof TEvents>(event: K, ...args: TEvents[K]): void;
    /**
     * Remove all listeners for a specific event.
     */
    off<K extends keyof TEvents>(event: K): void;
    /**
     * Remove all listeners for all events.
     */
    clear(): void;
    hasListeners<K extends keyof TEvents>(event: K): boolean;
    listenerCount<K extends keyof TEvents>(event: K): number;
    eventNames(): Array<keyof TEvents>;
    setDebug(enabled: boolean): void;
}
/**
 * Simple untyped emitter for cases where type safety isn’t needed.
 * Prefer TypedEmitter when possible.
 */
export declare class Emitter {
    private events;
    on(event: string, fn: (...args: any[]) => void, scope?: Scope): DisposeFn;
    once(event: string, fn: (...args: unknown[]) => void, scope?: Scope): DisposeFn;
    emit(event: string, ...args: unknown[]): void;
    off(event: string): void;
    clear(): void;
    hasListeners(event: string): boolean;
    listenerCount(event: string): number;
    eventNames(): string[];
}
