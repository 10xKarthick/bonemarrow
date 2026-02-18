import { FetchOptions, Scope } from "../types/index";

// ─────────────────────────────────────────────────────────────────────────────
// BoneMarrow Fetch Utility v1.2
//
// Optional convenience wrapper — not core infrastructure.
// Import from "bonemarrow/fetch", not "bonemarrow".
//
// Adds scope-aware cancellation, timeout, retry, deduplication, and typed
// JSON parsing on top of the browser fetch API.
// ─────────────────────────────────────────────────────────────────────────────

// Module-level WeakMap for dedup state. Keyed by Scope instance so:
// - State never outlives the Scope (WeakMap keys don't prevent GC)
// - Scope objects are never mutated or monkey-patched
const inFlightByScope = new WeakMap<Scope, Map<string, Promise<unknown>>>();

/**
 * Build a dedup cache key. Includes method and URL always.
 * For non-GET requests, includes the body string if available to prevent
 * incorrectly deduplicating POSTs with different payloads.
 */
function requestKey(url: string, init?: Omit<RequestInit, "signal">): string {
    const method = init?.method?.toUpperCase() ?? "GET";
    const body   = method !== "GET" && typeof init?.body === "string"
        ? `:${init.body}`
        : "";
    return `${method}:${url}${body}`;
}

/**
 * Fetch and parse a JSON response with scope-aware cancellation.
 *
 * If a scope is provided, the request is automatically aborted when the scope
 * is disposed — no configuration required.
 *
 * @example
 * const users = await fetchJson<User[]>("/api/users", { scope, timeout: 5000 });
 *
 * @example
 * // With retry, backoff delay, and deduplication:
 * const report = await fetchJson<Report>("/api/report", {
 *   scope,
 *   retryOnFailure: 3,
 *   retryDelay: 500,
 *   dedupe: true,
 * });
 */
export async function fetchJson<T>(
    url: string,
    options: FetchOptions<T> = {}
): Promise<T> {
    const {
        scope,
        timeout,
        retryOnFailure = 0,
        retryDelay     = 0,
        dedupe         = false,
        init,
        parse,
    } = options;

    // ── Deduplication ────────────────────────────────────────────────────────
    // Requires a scope — dedup is scoped per Scope instance by design.
    if (dedupe && scope) {
        let inFlight = inFlightByScope.get(scope);
        if (!inFlight) {
            inFlight = new Map();
            inFlightByScope.set(scope, inFlight);
        }

        const key      = requestKey(url, init);
        const existing = inFlight.get(key);
        if (existing) return existing as Promise<T>;

        const promise = executeWithRetry<T>({
            url, init, parse, timeout, retryOnFailure, retryDelay, scope,
        });

        inFlight.set(key, promise);

        // Remove from cache when settled, whichever comes first:
        // resolution, rejection, or scope disposal.
        const cleanup = () => inFlight!.delete(key);
        promise.then(cleanup, cleanup);
        scope.onDispose(cleanup);

        return promise;
    }

    // ── No deduplication ─────────────────────────────────────────────────────
    return executeWithRetry<T>({
        url, init, parse, timeout, retryOnFailure, retryDelay, scope,
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal
// ─────────────────────────────────────────────────────────────────────────────

interface ExecuteOptions<T> {
    url: string;
    init?: Omit<RequestInit, "signal">;
    parse?: (json: unknown) => T;
    timeout?: number;
    retryOnFailure: number;
    retryDelay: number;
    scope?: Scope;
}

async function executeWithRetry<T>(opts: ExecuteOptions<T>): Promise<T> {
    const { url, init, parse, timeout, retryOnFailure, retryDelay, scope } = opts;

    // Ref to the controller for whichever attempt is currently in flight.
    // Defined before the scope listener so the listener always sees the
    // current value even as it changes between attempts.
    let currentController: AbortController | null = null;

    // Wire the scope abort listener exactly once, outside the retry loop.
    // Wiring inside the loop would accumulate listeners across attempts.
    const onScopeAbort = () => currentController?.abort();

    if (scope) {
        if (scope.signal.aborted) {
            // Scope already disposed — fail immediately, don't even try.
            throw new DOMException("Scope already disposed", "AbortError");
        }
        scope.signal.addEventListener("abort", onScopeAbort, { once: true });
    }

    try {
        let attempt = 0;

        while (true) {
            // Fresh AbortController per attempt. A timeout or abort on one
            // attempt does not carry over and poison the next.
            const controller = new AbortController();
            currentController = controller;

            let timeoutId: ReturnType<typeof setTimeout> | undefined;

            if (typeof timeout === "number") {
                timeoutId = setTimeout(() => controller.abort(), timeout);
                // If scope abort and timeout fire simultaneously, both call
                // controller.abort() — this is safe, abort() is idempotent.
            }

            try {
                const res = await fetch(url, { ...init, signal: controller.signal });

                if (!res.ok) {
                    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
                } else {
                    const json = await res.json();
                    return parse ? parse(json) : (json as T);
                }

            } catch (err) {
                // Abort is always terminal — never retry a cancelled request.
                if (isAbortError(err)) throw err;

                attempt++;
                if (attempt > retryOnFailure) throw err;

                // Wait before retrying, but cut the delay short if the scope
                // is disposed — no point waiting out a full delay after cancel.
                if (retryDelay > 0) {
                    await abortableDelay(retryDelay, scope?.signal);
                }

                // Check abort again after the delay — scope may have been
                // disposed while we were waiting.
                if (scope?.signal.aborted) throw new DOMException("Scope disposed during retry", "AbortError");

            } finally {
                currentController = null;
                if (timeoutId !== undefined) clearTimeout(timeoutId);
            }
        }

    } finally {
        // Always remove the scope listener — whether we succeeded, failed, or
        // were aborted. Prevents listener accumulation across calls.
        if (scope) {
            scope.signal.removeEventListener("abort", onScopeAbort);
        }
    }
}

/**
 * Wait for `ms` milliseconds, resolving early if the signal aborts.
 * Resolves (never rejects) — the caller checks abort state after awaiting.
 */
function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise<void>((resolve) => {
        if (signal?.aborted) {
            resolve();
            return;
        }

        const timeoutId = setTimeout(resolve, ms);

        signal?.addEventListener(
            "abort",
            () => {
                clearTimeout(timeoutId);
                resolve();
            },
            { once: true }
        );
    });
}

/**
 * Detect abort errors across environments.
 * Checks error.name (modern standard) and error.code === 20 (legacy
 * DOMException in older Safari and some React Native environments).
 */
function isAbortError(error: unknown): boolean {
    return (
        error instanceof Error &&
        (error.name === "AbortError" || (error as any).code === 20)
    );
}
