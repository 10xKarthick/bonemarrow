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

import {DisposeFn, Scope} from "../types/index";

// ─────────────────────────────────────────────────────────────────────────────
// BoneMarrow Scope v1.2
//
// The root primitive. Everything in BoneMarrow flows through Scope:
// - Emitter cleanup is registered via onDispose
// - Refresh loop disposal is registered via onDispose
// - Fetch abort is wired via scope.signal
//
// Scope forms a tree. Disposing a parent disposes all children first.
// Cleanups run in LIFO order — last registered, first called.
// ─────────────────────────────────────────────────────────────────────────────


function createScopeInternal(
    parent: Scope | null,
    debugMode = false
): Scope {
    const controller = new AbortController();
    const cleanups: DisposeFn[] = [];
    const children = new Set<Scope>();
    let disposed = false;

    const MAX_CLEANUPS_WARNING = 50;

    const scope: Scope = {
        signal: controller.signal,

        onDispose(fn: DisposeFn): void {
            if (disposed) {
                // Scope is already dead — run immediately rather than silently
                // dropping the cleanup. This preserves the invariant that every
                // registered cleanup always runs exactly once.
                try {
                    fn();
                } catch (error) {
                    console.error("[Scope] Error in immediate dispose callback:", error);
                }
                return;
            }

            cleanups.push(fn);

            if (debugMode && cleanups.length > MAX_CLEANUPS_WARNING) {
                console.warn(
                    `[Scope] Possible cleanup leak: ${cleanups.length} cleanups registered (max: ${MAX_CLEANUPS_WARNING})`
                );
            }
        },

        createChild(): Scope {
            if (disposed) {
                console.warn("[Scope] Attempted to create child from disposed scope");
                const dead = createScopeInternal(null, debugMode);
                dead.dispose();
                return dead;
            }

            const child = createScopeInternal(scope, debugMode);
            children.add(child);

            // When the child disposes itself independently, remove it from the
            // parent's set so the parent won't attempt to dispose it again.
            // This is intentional — do not remove this cleanup.
            child.onDispose(() => children.delete(child));

            return child;
        },

        dispose(): void {
            if (disposed) return;
            disposed = true;

            // 1. Dispose children first (depth-first, order within set is
            //    insertion order — predictable but not guaranteed meaningful).
            for (const child of children) {
                child.dispose();
            }
            children.clear();

            // 2. Abort async work — signals fetch(), refresh loops, etc.
            controller.abort();

            // 3. Run cleanups in LIFO order. If B depends on A, B was registered
            //    after A, so B must clean up before A.
            for (let i = cleanups.length - 1; i >= 0; i--) {
                try {
                    cleanups[i]();
                } catch (error) {
                    console.error("[Scope] Error in cleanup function:", error);
                }
            }
            cleanups.length = 0;
        },
    };

    // Wire parent disposal to dispose this child automatically.
    // The child's own onDispose above handles removing itself from the
    // parent's children set, so there is no double-dispose risk.
    parent?.onDispose(() => scope.dispose());

    return scope;
}

// ─────────────────────────────────────────────────────────────────────────────
// Window scope
// ─────────────────────────────────────────────────────────────────────────────

let windowScope: Scope | null = null;

function getWindowScope(): Scope {
    if (windowScope) return windowScope;

    if (typeof window === "undefined") {
        throw new Error(
            "[Scope] createScope() requires a browser environment. " +
            "Use createRootScope() instead for Node.js, workers, or SSR."
        );
    }

    windowScope = createScopeInternal(null);

    const disposeAll = (): void => {
        if (!windowScope) return;
        windowScope.dispose();
        windowScope = null;
    };

    // { once: true } ensures listeners remove themselves after firing,
    // preventing phantom listeners if the window scope is recreated.
    // Both events are handled because browser support varies — pagehide
    // is preferred for bfcache-aware cleanup, beforeunload as fallback.
    window.addEventListener("pagehide",     disposeAll, { once: true });
    window.addEventListener("beforeunload", disposeAll, { once: true });

    return windowScope;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a new scope attached to the window scope.
 * Automatically disposed when the page is hidden or unloaded.
 *
 * For testing or non-browser environments, use createRootScope() instead.
 */
export function createScope(options?: { debug?: boolean }): Scope {
    const root = getWindowScope();
    return createScopeInternal(root, options?.debug ?? false);
}

/**
 * Create a standalone root scope with no parent.
 *
 * Use this in:
 * - Tests — gives you full control over scope lifetime without window dependency
 * - Non-browser environments (Node, workers) — no window to attach to
 * - Cases where you need an isolated scope tree
 *
 * You are responsible for calling dispose() on root scopes.
 *
 * @example
 * const scope = createRootScope();
 * // ... do work ...
 * scope.dispose();
 */
export function createRootScope(options?: { debug?: boolean }): Scope {
    return createScopeInternal(null, options?.debug ?? false);
}

/**
 * Check if a scope has been disposed.
 *
 * Equivalent to scope.signal.aborted — provided as a readable alternative.
 */
export function isScopeDisposed(scope: Scope): boolean {
    return scope.signal.aborted;
}
