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

import {DisposeFn, EmitterLogger, Scope} from "../types/index";

// ─────────────────────────────────────────────────────────────────────────────
// BoneMarrow Emitter v1.2
//
// Scope: event emission for UI lifecycle events within BoneMarrow.
// This is NOT a general-purpose event bus. It exists to support:
//   - Component lifecycle signals (mount, unmount, refresh)
//   - Scoped cleanup via Scope integration
//   - Save/async hooks where handlers may be async
//
// If you need a full event bus, use a dedicated library.
// ─────────────────────────────────────────────────────────────────────────────

const consoleLogger: EmitterLogger = {
    log:   (msg: string)       => console.log(msg),
    warn:  (msg: string)       => console.warn(msg),
    error: (msg: string, err: unknown)  => console.error(msg, err),
};

/**
 * Type-safe event emitter with automatic cleanup and error isolation.
 *
 * @version 1.2.0
 *
 * Designed for BoneMarrow lifecycle events. Stays predictable:
 * - Sync emit isolates handler errors
 * - Async emit surfaces all rejections via AggregateError (ES2021+)
 * - Scope integration handles automatic cleanup
 * - Debug mode includes leak detection
 *
 * @example
 * type Events = {
 *   change: [data: string];
 *   reset:  [];
 * };
 *
 * const emitter = new TypedEmitter<Events>();
 * emitter.on("change", (data) => console.log(data));
 */
export class TypedEmitter<TEvents extends Record<string, unknown[]>> {
    private events = new Map<keyof TEvents, Set<(...args: any[]) => void>>();
    private debugMode: boolean;
    private logger: EmitterLogger;
    private readonly maxListeners: number;

    /**
     * @param options.debug        - Enable debug/leak logging. Dev only — disable in production.
     * @param options.logger       - Custom logger. Defaults to console.
     * @param options.maxListeners - Warn threshold per event (dev only). Default: 50.
     */
    constructor(options?: {
        debug?: boolean;
        logger?: EmitterLogger;
        maxListeners?: number;
    }) {
        this.debugMode    = options?.debug        ?? false;
        this.logger       = options?.logger       ?? consoleLogger;
        this.maxListeners = options?.maxListeners ?? 50;
    }

    /**
     * Register an event listener.
     *
     * Returns a DisposeFn that removes the listener when called.
     * Pass a Scope to auto-remove when the scope is disposed.
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
            this.logger.log(
                `[Emitter] Listener added for "${String(event)}" (total: ${set.size})`
            );
            if (set.size > this.maxListeners) {
                this.logger.warn(
                    `[Emitter] Possible listener leak: "${String(event)}" has ${set.size} listeners (max: ${this.maxListeners})`
                );
            }
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
                this.logger.log(
                    `[Emitter] Listener removed for "${String(event)}" (remaining: ${set!.size})`
                );
            }
        };

        scope?.onDispose(cleanup);
        return cleanup;
    }

    /**
     * Register a one-time event listener.
     *
     * The listener is removed *before* the handler executes.
     * If the handler throws, the listener is already gone — intentional.
     * There is no retry semantics. Use `on()` if you need to control removal yourself.
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
     * Returns a Promise that resolves with the args of the next emission.
     *
     * ⚠️ Scope disposal caveat: if the provided scope is disposed before the
     * event fires, the Promise will never resolve or reject — it hangs silently.
     * If your scope may be short-lived, either:
     *   - Don't pass a scope, and manage cleanup manually
     *   - Or set a timeout externally: `Promise.race([emitter.onceAsync(...), timeout])`
     *
     * @example
     * const [data] = await emitter.onceAsync("ready");
     */
    onceAsync<K extends keyof TEvents>(
        event: K,
        scope?: Scope
    ): Promise<TEvents[K]> {
        return new Promise<TEvents[K]>((resolve) => {
            this.once(event, (...args: TEvents[K]) => resolve(args), scope);
        });
    }

    /**
     * Emit an event synchronously to all registered listeners.
     *
     * Errors are isolated per handler — one failure does not stop others.
     * If you need to know when handlers have finished async work, use emitAsync().
     */
    emit<K extends keyof TEvents>(event: K, ...args: TEvents[K]): void {
        const handlers = this.events.get(event);

        if (!handlers || handlers.size === 0) {
            if (this.debugMode) {
                this.logger.log(`[Emitter] No listeners for "${String(event)}"`);
            }
            return;
        }

        if (this.debugMode) {
            this.logger.log(
                `[Emitter] Emitting "${String(event)}" to ${handlers.size} listener(s)`
            );
        }

        for (const fn of [...handlers]) {
            try {
                fn(...args);
            } catch (error) {
                this.logger.error(
                    `[Emitter] Error in handler for "${String(event)}":`,
                    error
                );
            }
        }
    }

    /**
     * Emit an event and await all async handlers.
     *
     * All handlers always run regardless of individual failures.
     * Any rejections are collected and re-thrown together as an AggregateError.
     *
     * Use this for lifecycle hooks where async work must complete before
     * continuing (e.g. save hooks, pre-unmount cleanup).
     *
     * ⚠️ Requires ES2021+ (AggregateError). Check your tsconfig target.
     *    If targeting older environments, add a polyfill.
     *
     * @example
     * await emitter.emitAsync("beforeSave", payload);
     */
    async emitAsync<K extends keyof TEvents>(
        event: K,
        ...args: TEvents[K]
    ): Promise<void> {
        const handlers = this.events.get(event);

        if (!handlers || handlers.size === 0) {
            if (this.debugMode) {
                this.logger.log(
                    `[Emitter] No listeners for "${String(event)}" (async)`
                );
            }
            return;
        }

        if (this.debugMode) {
            this.logger.log(
                `[Emitter] Emitting (async) "${String(event)}" to ${handlers.size} listener(s)`
            );
        }

        const results = await Promise.allSettled(
            [...handlers].map((fn) => fn(...args))
        );

        const errors = results
            .filter((r): r is PromiseRejectedResult => r.status === "rejected")
            .map((r) => r.reason);

        if (errors.length > 0) {
            throw new AggregateError(
                errors,
                `[Emitter] ${errors.length} handler(s) failed for "${String(event)}"`
            );
        }
    }

    /**
     * Remove all listeners for a specific event.
     *
     * ⚠️ Scope asymmetry: if listeners were registered with a Scope, the Scope
     * still holds its disposer reference after off() is called. The event is
     * gone, but the disposer will run harmlessly when the scope is disposed.
     * This is intentional — the contract is safe, just asymmetrical.
     */
    off<K extends keyof TEvents>(event: K): void {
        const deleted = this.events.delete(event);

        if (this.debugMode && deleted) {
            this.logger.log(
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
            this.logger.log(
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
 * Untyped emitter alias for quick prototyping or dynamic event names.
 *
 * Backed by TypedEmitter — zero duplication, zero runtime overhead.
 * Prefer TypedEmitter with explicit event types in production code.
 *
 * @example
 * const emitter = new Emitter();
 * emitter.on("change", (data) => console.log(data));
 */
export type Emitter = TypedEmitter<Record<string, unknown[]>>;
// eslint-disable-next-line @typescript-eslint/no-redeclare
export const Emitter = TypedEmitter as new (
    options?: ConstructorParameters<typeof TypedEmitter>[0]
) => TypedEmitter<Record<string, unknown[]>>;
