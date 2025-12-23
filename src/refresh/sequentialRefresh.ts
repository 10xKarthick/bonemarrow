import {DisposeFn, Scope} from "../core/scope";

export function startSequentialRefresh(
    fn: () => Promise<unknown>,
    opts: {
        interval: number;
        scope: Scope;
        immediate?: boolean;
    }
): DisposeFn {
    const { interval, scope, immediate = true } = opts;

    let stopped: boolean = false;
    let timeoutId: number | undefined;

    const loop: () => Promise<void> = async(): Promise<void> => {
        if (stopped) return;
        try {
            await fn();
        } catch {}
        if (stopped) return;
        timeoutId = window.setTimeout(loop, interval);
    };

    immediate ? loop() : (timeoutId = window.setTimeout(loop, interval));

    const stop: () => void = (): void => {
        stopped = true;
        if (timeoutId) clearTimeout(timeoutId);
    }

    scope.onDispose(stop);
    return stop;
}