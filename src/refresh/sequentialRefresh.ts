import { DisposeFn, Scope } from "../core/scope";

export interface SequentialRefreshOptions {
    interval: number;
    scope: Scope;
    immediate?: boolean;
    onError?: (error: unknown) => void;
    maxRetries?: number; // 0 = infinite
    backoff?: boolean;
}

/**
 * Start a sequential auto-refresh loop that prevents overlapping requests.
 */
export function startSequentialRefresh(
    fn: () => Promise<unknown>,
    opts: SequentialRefreshOptions
): DisposeFn {
    const {
        interval,
        scope,
        immediate = true,
        onError,
        maxRetries = 0,
        backoff = false
    } = opts;

    let stopped = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let consecutiveErrors = 0;
    let isRunning = false;

    const calculateDelay = (): number => {
        if (!backoff || consecutiveErrors === 0) {
            return interval;
        }
        const multiplier = Math.min(2 ** consecutiveErrors, 10);
        return interval * multiplier;
    };

    const stop = (): void => {
        if (stopped) return;
        stopped = true;
        if (timeoutId !== undefined) {
            clearTimeout(timeoutId);
            timeoutId = undefined;
        }
    };

    const loop = async (): Promise<void> => {
        if (stopped) return;

        if (isRunning) {
            console.warn(
                "[SequentialRefresh] Previous execution still running"
            );
            return;
        }

        isRunning = true;

        try {
            await fn();
            consecutiveErrors = 0;
        } catch (error) {
            consecutiveErrors++;

            if (onError) {
                try {
                    onError(error);
                } catch (handlerError) {
                    console.error(
                        "[SequentialRefresh] Error in error handler:",
                        handlerError
                    );
                }
            } else {
                console.error(
                    "[SequentialRefresh] Error in refresh function:",
                    error
                );
            }

            if (
                maxRetries > 0 &&
                consecutiveErrors >= maxRetries
            ) {
                console.error(
                    `[SequentialRefresh] Max retries (${maxRetries}) exceeded. Stopping refresh.`
                );
                stop();
                return;
            }
        } finally {
            isRunning = false;
        }

        if (!stopped) {
            const delay = calculateDelay();
            timeoutId = setTimeout(loop, delay);
        }
    };

    if (immediate) {
        loop();
    } else {
        timeoutId = setTimeout(loop, interval);
    }

    scope.onDispose(stop);
    return stop;
}

/**
 * Create a pausable sequential refresh controller.
 */
export function createPausableRefresh(
    fn: () => Promise<unknown>,
    opts: SequentialRefreshOptions
): {
    pause: () => void;
    resume: () => void;
    stop: () => void;
    isPaused: () => boolean;
    isRunning: () => boolean;
} {
    let stopFn: DisposeFn | null = null;
    let paused = false;

    const start = () => {
        if (stopFn) return;
        stopFn = startSequentialRefresh(fn, opts);
    };

    const pause = () => {
        if (paused) return;
        paused = true;
        if (stopFn) {
            stopFn();
            stopFn = null;
        }
    };

    const resume = () => {
        if (!paused) return;
        paused = false;
        start();
    };

    const stop = () => {
        paused = false;
        if (stopFn) {
            stopFn();
            stopFn = null;
        }
    };

    start();

    return {
        pause,
        resume,
        stop,
        isPaused: () => paused,
        isRunning: () => stopFn !== null && !paused
    };
}
