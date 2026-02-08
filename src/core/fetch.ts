import { Scope } from "./scope";

export interface FetchOptions<T> {
    scope?: Scope;
    abort?: boolean;
    timeout?: number;
    retryOnFailure?: number;
    retryDelay?: number;
    dedupe?: boolean;
    init?: RequestInit;
    parse?: (json: unknown) => T;
}

function requestKey(url: string, init?: RequestInit): string {
    return `${init?.method ?? "GET"}:${url}`;
}

export async function fetchJson<T>(
    url: string,
    options: FetchOptions<T> = {}
): Promise<T> {
    const {
        scope,
        abort = false,
        timeout,
        retryOnFailure = 0,
        retryDelay = 0,
        dedupe = false,
        init,
        parse
    } = options;

    const internalScope = scope as Scope & {
        _inFlight?: Map<string, Promise<unknown>>;
    };

    let inFlight: Map<string, Promise<unknown>> | undefined;
    let key: string | undefined;

    // Request deduplication (per-scope)
    if (dedupe && internalScope) {
        inFlight =
            internalScope._inFlight ??
            (internalScope._inFlight = new Map());

        key = requestKey(url, init);

        const existing = inFlight.get(key);
        if (existing) {
            return existing as Promise<T>;
        }
    }

    const promise: Promise<T> = (async () => {
        let attempt = 0;

        while (true) {
            const controller = new AbortController();

            if (abort && scope) {
                scope.signal.addEventListener(
                    "abort",
                    () => controller.abort(),
                    { once: true }
                );
            }

            let timeoutId: ReturnType<typeof setTimeout> | undefined;
            if (typeof timeout === "number") {
                timeoutId = setTimeout(
                    () => controller.abort(),
                    timeout
                );
            }

            try {
                const res = await fetch(url, {
                    ...init,
                    signal: controller.signal
                });

                if (!res.ok) {
                    throw new Error(
                        `HTTP ${res.status}: ${res.statusText}`
                    );
                }

                const json = await res.json();
                return parse ? parse(json) : (json as T);
            } catch (err) {
                attempt++;

                // Abort is terminal
                if (
                    err instanceof DOMException &&
                    err.name === "AbortError"
                ) {
                    throw err;
                }

                if (attempt > retryOnFailure) {
                    throw err;
                }

                if (retryDelay > 0) {
                    await new Promise(resolve =>
                        setTimeout(resolve, retryDelay)
                    );
                }
            } finally {
                if (timeoutId) {
                    clearTimeout(timeoutId);
                }
            }
        }
    })();

    // Track in-flight promise for dedupe
    if (inFlight && key && internalScope) {
        inFlight.set(key, promise);

        const cleanup = () => {
            inFlight!.delete(key!);
        };

        promise.then(cleanup, cleanup);
        internalScope.onDispose(cleanup);
    }

    return promise;
}
