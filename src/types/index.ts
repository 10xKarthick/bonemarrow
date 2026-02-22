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

/**
 * Injectable logger interface — keeps BoneMarrow logging-agnostic.
 * Pass a custom logger via the constructor to integrate with your
 * existing logging infrastructure (e.g. Sentry, Datadog, custom).
 *
 * Defaults to console in debug mode.
 */
export interface EmitterLogger {
    log(message: string): void;
    warn(message: string): void;
    error(message: string, error: unknown): void;
}

export interface FetchOptions<T> {
    /**
     * BoneMarrow Scope. When provided:
     * - The request is automatically aborted when the scope is disposed.
     * - Deduplication (if enabled) is isolated per Scope instance.
     */
    scope?: Scope;

    /** Request timeout in milliseconds. Applies per attempt, not total. */
    timeout?: number;

    /**
     * Number of retry attempts after the first failure. Default: 0.
     * retryOnFailure: 1 → up to 2 total attempts (1 initial + 1 retry).
     * retryOnFailure: N → up to N+1 total attempts.
     * Aborts are never retried — they are always terminal.
     */
    retryOnFailure?: number;

    /**
     * Milliseconds to wait between retry attempts. Default: 0.
     * Respects scope disposal — if the scope is disposed during a delay,
     * the wait is cut short and the attempt is abandoned immediately.
     */
    retryDelay?: number;

    /**
     * Deduplicate concurrent requests with the same method + URL (+ body for
     * non-GET requests) per Scope instance.
     * Requires scope to be provided — silently ignored without one.
     * Default: false.
     */
    dedupe?: boolean;

    /**
     * Passed directly to fetch(). Do not include signal — it is managed
     * internally and will be overwritten if provided.
     */
    init?: Omit<RequestInit, "signal">;

    /** Transform the parsed JSON before returning. Runs after res.json(). */
    parse?: (json: unknown) => T;
}

export interface RefreshOptions {
    /**
     * Milliseconds between the end of one execution and the start of the next.
     * Must be greater than 0.
     */
    interval: number;

    /** Scope that owns this refresh loop. Loop stops when scope is disposed. */
    scope: Scope;

    /** Run immediately on creation. Default: true. */
    immediate?: boolean;

    /** Start in a paused state. Default: false. */
    startPaused?: boolean;

    /** Called when fn throws or rejects. If omitted, errors are logged to console. */
    onError?: (error: unknown) => void;

    /**
     * Stop after this many consecutive errors. 0 = retry forever. Default: 0.
     * Count resets to zero on any successful execution.
     */
    maxRetries?: number;

    /**
     * Exponential backoff on consecutive errors, capped at 10× interval.
     * Default: false.
     */
    backoff?: boolean;

    /**
     * Optional debug callback. Called with diagnostic messages.
     * Keep out of production — wire to your logger or console as needed.
     *
     * @example
     * onDebug: (msg) => console.log(msg)
     */
    onDebug?: (message: string) => void;
}

export interface RefreshController {
    /** Suspend scheduling. Any in-flight execution completes naturally. */
    pause(): void;

    /**
     * Resume scheduling after a pause. Starts a new tick immediately.
     * No-op if not paused or already stopped.
     */
    resume(): void;

    /** Permanently stop the loop and abort any in-flight execution. */
    stop(): void;

    /** True if the loop is currently paused. */
    isPaused(): boolean;

    /**
     * True if fn() is currently executing.
     * Remains true during a tick that started before pause() was called.
     */
    isExecuting(): boolean;
}


export type DisposeFn = () => void;

export interface Scope {
    /**
     * AbortSignal that is aborted when this scope is disposed.
     * Wire this to fetch(), refresh loops, or any cancellable async work.
     */
    readonly signal: AbortSignal;

    /**
     * Register a cleanup function to run when this scope is disposed.
     *
     * If the scope is already disposed, fn() is called immediately.
     * This is intentional — registration on a dead scope is never silently dropped.
     *
     * Cleanups run in LIFO order (last registered, first called).
     */
    onDispose(fn: DisposeFn): void;

    /**
     * Create a child scope. The child is disposed automatically when the
     * parent is disposed. The child can also be disposed independently —
     * doing so removes it from the parent's tracking without affecting the parent.
     *
     * If called on an already-disposed scope, returns a pre-disposed scope
     * and logs a warning.
     */
    createChild(): Scope;

    /**
     * Dispose this scope and all of its children.
     * Idempotent — safe to call multiple times.
     *
     * Disposal order:
     * 1. Children disposed (recursively, depth-first)
     * 2. AbortSignal aborted
     * 3. Cleanups run (LIFO)
     */
    dispose(): void;
}

export interface AutoRefreshOptions {
    interval: number;

    /**
     * Child scope to own the refresh loop.
     * If omitted, the collection's own scope is used — the loop runs until
     * the collection is destroyed.
     *
     * ⚠️ If you pass a custom scope, the collection's destruction will NOT
     * stop the loop unless that scope is a child of the collection's scope.
     * Prefer: `collection.autoRefresh(url, { scope: collScope.createChild() })`
     * or omit scope and let the collection own the loop.
     */
    scope?: Scope;

    immediate?: boolean;
    startPaused?: boolean;
    onError?: (error: unknown) => void;
    maxRetries?: number;
    backoff?: boolean;
    onDebug?: (message: string) => void;
}

export interface ViewOptions {
    /**
     * Automatically destroy the view when its root element is removed from
     * the DOM. Uses MutationObserver.
     *
     * ⚠️ Requires the root element to be attached to the DOM at construction
     * time. If root has no parentElement, the observer cannot attach and
     * autoDestroy will silently not work.
     *
     * ⚠️ If the root element is removed and re-inserted before the
     * MutationObserver fires, the view will be destroyed on the first removal
     * even if re-inserted. For dynamic node movement, manage lifecycle manually.
     *
     * Default: true.
     */
    autoDestroy?: boolean;

    /**
     * Parent scope. If provided, the view's scope is created as a child —
     * disposing the parent automatically disposes this view.
     */
    parentScope?: Scope;
}
