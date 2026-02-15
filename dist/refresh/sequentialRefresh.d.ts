import { DisposeFn, Scope } from "../core/scope";
export interface SequentialRefreshOptions {
    interval: number;
    scope: Scope;
    immediate?: boolean;
    onError?: (error: unknown) => void;
    maxRetries?: number;
    backoff?: boolean;
}
/**
 * Start a sequential auto-refresh loop that prevents overlapping requests.
 */
export declare function startSequentialRefresh(fn: () => Promise<unknown>, opts: SequentialRefreshOptions): DisposeFn;
/**
 * Create a pausable sequential refresh controller.
 */
export declare function createPausableRefresh(fn: () => Promise<unknown>, opts: SequentialRefreshOptions): {
    pause: () => void;
    resume: () => void;
    stop: () => void;
    isPaused: () => boolean;
    isRunning: () => boolean;
};
