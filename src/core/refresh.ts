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

import {RefreshController, RefreshOptions} from "../types/index";

// ─────────────────────────────────────────────────────────────────────────────
// BoneMarrow Refresh v1.2
//
// One primitive. One mental model.
// A sequential, non-overlapping refresh loop with full lifecycle integration.
//
// fn receives a fresh AbortSignal each tick so in-flight async work can be
// cancelled precisely when stop() is called or the scope is disposed. Wire it
// to fetch() or any cancellable async operation. If your fn doesn't need
// cancellation, ignore the signal — it costs nothing.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a sequential, non-overlapping refresh loop.
 *
 * The loop waits for each execution to finish before scheduling the next,
 * preventing overlapping requests regardless of how slow fn() is.
 *
 * fn receives a fresh AbortSignal each tick. The signal is aborted if stop()
 * is called while that tick is in flight. Pass it to fetch() or any
 * cancellable async operation.
 *
 * @example
 * const refresh = createRefresh(
 *   async (signal) => {
 *     const res = await fetch("/api/data", { signal });
 *     store.set(await res.json());
 *   },
 *   { interval: 5000, scope }
 * );
 *
 * refresh.pause();
 * refresh.resume();
 * refresh.stop();
 *
 * @throws If interval is not a positive number.
 */
export function createRefresh(
    fn: (signal: AbortSignal) => Promise<unknown>,
    opts: RefreshOptions
): RefreshController {
    const {
        interval,
        scope,
        immediate   = true,
        startPaused = false,
        onError,
        maxRetries  = 0,
        backoff     = false,
        onDebug,
    } = opts;

    if (!(interval > 0)) {
        throw new Error(
            `[Refresh] interval must be a positive number, got: ${interval}`
        );
    }

    let stopped           = false;
    let paused            = startPaused;
    let executing         = false;
    let consecutiveErrors = 0;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    // Per-tick abort controller. A fresh one is created at the start of each
    // tick so that aborting one tick never poisons future executions.
    let currentAbort: AbortController | null = null;

    const debug = (msg: string): void => onDebug?.(`[Refresh] ${msg}`);

    const calculateDelay = (): number => {
        if (!backoff || consecutiveErrors === 0) return interval;
        return interval * Math.min(2 ** consecutiveErrors, 10);
    };

    const clearScheduled = (): void => {
        if (timeoutId !== undefined) {
            clearTimeout(timeoutId);
            timeoutId = undefined;
        }
    };

    const schedule = (delay: number): void => {
        clearScheduled();
        timeoutId = setTimeout(tick, delay);
        debug(`Next tick in ${delay}ms`);
    };

    const tick = async (): Promise<void> => {
        if (stopped || paused) return;

        // Overlap guard — sequential by design, but defensive against edge cases
        // such as resume() being called while a tick is still mid-flight.
        if (executing) {
            debug("Skipped tick: previous execution still running");
            return;
        }

        // Fresh controller per tick. Aborting this one cannot affect future ticks.
        const abort = new AbortController();
        currentAbort = abort;
        executing = true;
        debug("Tick started");

        try {
            await fn(abort.signal);
            consecutiveErrors = 0;
            debug("Tick completed");
        } catch (error) {
            // Abort errors are intentional cancellation — not failures.
            if (isAbortError(error)) {
                debug("Tick aborted");
                return;
            }

            consecutiveErrors++;
            debug(`Tick failed (consecutive errors: ${consecutiveErrors})`);

            if (onError) {
                try {
                    onError(error);
                } catch (handlerError) {
                    console.error("[Refresh] Error in onError handler:", handlerError);
                }
            } else {
                console.error("[Refresh] Unhandled error in refresh fn:", error);
            }

            if (maxRetries > 0 && consecutiveErrors >= maxRetries) {
                console.error(
                    `[Refresh] Stopping after ${maxRetries} consecutive error(s).`
                );
                stop();
                return;
            }
        } finally {
            executing = false;
            currentAbort = null;
        }

        if (!stopped && !paused) {
            schedule(calculateDelay());
        }
    };

    const pause = (): void => {
        if (stopped || paused) return;
        paused = true;
        clearScheduled();
        // In-flight tick completes naturally. pause() does not abort it —
        // the work is already happening and stopping it mid-flight would
        // leave state inconsistent. The executing flag clears on its own.
        debug("Paused");
    };

    const resume = (): void => {
        if (stopped || !paused) return;
        paused = false;
        debug("Resumed");
        // Always start a new tick immediately on resume rather than waiting
        // out a full interval. "Resume" means "start now."
        tick();
    };

    const stop = (): void => {
        if (stopped) return;
        stopped = true;
        paused  = false;
        clearScheduled();
        // Abort only the currently in-flight tick, if any.
        // Future ticks are already prevented by stopped = true.
        currentAbort?.abort();
        currentAbort = null;
        debug("Stopped");
    };

    // Scope owns exactly one disposer — registered once at construction, never again.
    scope.onDispose(stop);

    if (!startPaused) {
        if (immediate) {
            tick();
        } else {
            schedule(interval);
        }
    }

    return {
        pause,
        resume,
        stop,
        isPaused:    () => paused,
        isExecuting: () => executing,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detect abort errors across environments.
 * Checks both error.name (modern) and error.code (legacy DOMException in
 * older Safari and some React Native environments).
 */
function isAbortError(error: unknown): boolean {
    return (
        error instanceof Error &&
        (error.name === "AbortError" || (error as any).code === 20)
    );
}
