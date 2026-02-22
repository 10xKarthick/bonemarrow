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

import {TypedEmitter} from "../core/emitter";
import {createRootScope} from "../core/scope";
import {fetchJson} from "../core/fetch";
import {createRefresh,} from "../core/refresh";
import {AutoRefreshOptions, DisposeFn, RefreshController, Scope} from "../types/index";

// ─────────────────────────────────────────────────────────────────────────────
// BoneMarrow Model v1.2
//
// Reactive state container with lifecycle integration.
// Import from "bonemarrow/model", not "bonemarrow".
//
// Model owns a Scope. When the scope is disposed, the model is destroyed —
// listeners are cleared, refresh loops stop, in-flight fetches are aborted.
// There is one lifecycle path, not two.
// ─────────────────────────────────────────────────────────────────────────────

type ModelEvents<T> = {
    change: [patch: Partial<T>];
};

export class Model<T extends object> {
    private data: T;
    private initial: T;
    private emitter = new TypedEmitter<ModelEvents<T>>();
    private scope: Scope;

    /**
     * Create a model with an initial state.
     *
     * @param initial - Initial state. Shallow-cloned on construction and reset.
     * @param scope   - Scope that owns this model. When the scope is disposed,
     *                  the model is destroyed automatically. If omitted, a root
     *                  scope is created — you are responsible for calling
     *                  model.destroy() to clean up.
     *
     * ⚠️ Scope ownership: passing an external scope grants lifecycle ownership
     * to this model. Calling destroy() will dispose that scope, which affects
     * all other resources tied to it. If multiple models share a scope,
     * destroying any one of them destroys all of them.
     * Use a dedicated child scope per model if you need independent lifetimes:
     *   `new Model(data, parentScope.createChild())`
     *
     * @example
     * const model = new Model({ count: 0 }, scope);
     */
    constructor(initial: T, scope?: Scope) {
        this.initial = { ...initial };
        this.data    = { ...initial };

        // If no scope provided, create a root scope so the model always has
        // one lifecycle path. Caller is responsible for calling destroy().
        this.scope = scope ?? createRootScope();

        // Model destroys itself when its scope is disposed.
        // destroy() is idempotent — safe to call multiple times.
        this.scope.onDispose(() => this._destroy());
    }

    // ── Read ─────────────────────────────────────────────────────────────────

    get<K extends keyof T>(key: K): T[K] {
        this.checkDestroyed();
        return this.data[key];
    }

    getAll(): Readonly<T> {
        this.checkDestroyed();
        return { ...this.data };
    }

    /**
     * True if the current state differs from the initial state.
     * Shallow comparison.
     */
    isDirty(): boolean {
        this.checkDestroyed();
        return (Object.keys(this.initial) as Array<keyof T>).some(
            (key) => this.initial[key] !== this.data[key]
        );
    }

    has<K extends keyof T>(key: K, value: T[K]): boolean {
        this.checkDestroyed();
        return this.data[key] === value;
    }

    // ── Write ────────────────────────────────────────────────────────────────

    /**
     * Apply a partial patch to the model state.
     * Only changed keys are applied. Emits "change" only if something changed.
     * Returns true if any key changed, false if state was already identical.
     */
    set(patch: Partial<T>): boolean {
        this.checkDestroyed();

        const changes: Partial<T> = {};
        let hasChanges = false;

        for (const key of Object.keys(patch) as Array<keyof T>) {
            if (patch[key] !== this.data[key]) {
                changes[key] = patch[key];
                hasChanges = true;
            }
        }

        if (!hasChanges) return false;

        Object.assign(this.data, changes);
        this.emitter.emit("change", changes);
        return true;
    }

    /**
     * Reset model state to the initial values provided at construction.
     * Emits "change" only if state differs from initial.
     */
    reset(): void {
        this.checkDestroyed();
        const resetData = { ...this.initial };
        const hasChanges = (Object.keys(resetData) as Array<keyof T>).some(
            (key) => resetData[key] !== this.data[key]
        );

        if (hasChanges) {
            this.data = resetData;
            this.emitter.emit("change", resetData);
        }
    }

    // ── Observe ──────────────────────────────────────────────────────────────

    /**
     * Listen for any state change.
     * fn receives the patch — only the keys that actually changed.
     *
     * @example
     * model.onChange((patch) => console.log(patch), scope);
     */
    onChange(fn: (patch: Partial<T>) => void, scope?: Scope): DisposeFn {
        this.checkDestroyed();
        return this.emitter.on("change", fn, scope);
    }

    /**
     * Watch a single key for changes.
     * fn is called only when that specific key changes.
     *
     * @example
     * model.watch("username", (value) => console.log(value), scope);
     */
    watch<K extends keyof T>(
        key: K,
        fn: (value: T[K]) => void,
        scope?: Scope
    ): DisposeFn {
        this.checkDestroyed();
        return this.emitter.on(
            "change",
            (patch) => {
                if (key in patch) {
                    fn(patch[key] as T[K]);
                }
            },
            scope
        );
    }

    // ── Network ──────────────────────────────────────────────────────────────

    /**
     * Fetch a partial state patch from a URL and apply it to the model.
     * Uses the model's own scope — aborted if the model is destroyed.
     * Returns the full model state after patching.
     */
    async fetch(url: string, timeout?: number): Promise<Readonly<T>> {
        this.checkDestroyed();

        const patch = await fetchJson<Partial<T>>(url, {
            scope:   this.scope,
            timeout,
        });

        this.set(patch);
        return this.getAll();
    }

    /**
     * Start a sequential auto-refresh loop that keeps the model up to date.
     *
     * Returns a RefreshController — use pause(), resume(), stop() to control
     * the loop without destroying the model.
     *
     * If no scope is provided in options, the model's own scope owns the loop —
     * it stops automatically when the model is destroyed.
     *
     * @example
     * const refresh = model.autoRefresh("/api/user", { interval: 5000 });
     * refresh.pause(); // while editing
     * refresh.resume();
     */
    autoRefresh(
        url: string,
        options: AutoRefreshOptions
    ): RefreshController {
        this.checkDestroyed();

        // Use caller-provided scope (e.g. a child scope for independent control)
        // or fall back to the model's own scope.
        const refreshScope = options.scope ?? this.scope;

        return createRefresh(
            async (signal) => {
                // Bail immediately if the model was destroyed between ticks.
                if (this.isDestroyed()) return;

                const patch = await fetchJson<Partial<T>>(url, {
                    scope: refreshScope,
                });

                this.set(patch);
            },
            {
                interval:    options.interval,
                scope:       refreshScope,
                immediate:   options.immediate,
                startPaused: options.startPaused,
                onError:     options.onError,
                maxRetries:  options.maxRetries,
                backoff:     options.backoff,
                onDebug:     options.onDebug,
            }
        );
    }

    // ── Lifecycle ────────────────────────────────────────────────────────────

    /**
     * Destroy the model explicitly.
     * Disposes the model's scope — this stops all refresh loops, aborts
     * in-flight fetches, and clears all listeners.
     *
     * ⚠️ If a scope was passed at construction, this disposes that scope too.
     * Any other resources tied to that scope will also be destroyed.
     * Idempotent — safe to call multiple times.
     *
     * After destruction, all method calls throw.
     */
    destroy(): void {
        // Dispose the scope — this triggers _destroy() via onDispose.
        // If scope was provided externally, this disposes it too — which is
        // intentional. The model owns its scope for lifecycle purposes.
        this.scope.dispose();
    }

    isDestroyed(): boolean {
        return this.scope.signal.aborted;
    }

    private _destroy(): void {
        this.emitter.clear();
    }

    private checkDestroyed(): void {
        if (this.isDestroyed()) {
            throw new Error("[Model] Cannot use a destroyed model");
        }
    }
}
