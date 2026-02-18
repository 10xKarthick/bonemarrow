"use strict";
var bone = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/index.ts
  var index_exports = {};
  __export(index_exports, {
    Collection: () => Collection,
    Elements: () => Elements,
    Emitter: () => Emitter,
    Model: () => Model,
    TypedEmitter: () => TypedEmitter,
    View: () => View,
    createRefresh: () => createRefresh,
    createRootScope: () => createRootScope,
    createScope: () => createScope,
    createView: () => createView,
    el: () => el,
    elFromHtml: () => elFromHtml,
    fetchJson: () => fetchJson,
    isElements: () => isElements,
    isScopeDisposed: () => isScopeDisposed
  });

  // src/core/scope.ts
  function createScopeInternal(parent, debugMode = false) {
    const controller = new AbortController();
    const cleanups = [];
    const children = /* @__PURE__ */ new Set();
    let disposed = false;
    const MAX_CLEANUPS_WARNING = 50;
    const scope = {
      signal: controller.signal,
      onDispose(fn) {
        if (disposed) {
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
      createChild() {
        if (disposed) {
          console.warn("[Scope] Attempted to create child from disposed scope");
          const dead = createScopeInternal(null, debugMode);
          dead.dispose();
          return dead;
        }
        const child = createScopeInternal(scope, debugMode);
        children.add(child);
        child.onDispose(() => children.delete(child));
        return child;
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        for (const child of children) {
          child.dispose();
        }
        children.clear();
        controller.abort();
        for (let i = cleanups.length - 1; i >= 0; i--) {
          try {
            cleanups[i]();
          } catch (error) {
            console.error("[Scope] Error in cleanup function:", error);
          }
        }
        cleanups.length = 0;
      }
    };
    parent == null ? void 0 : parent.onDispose(() => scope.dispose());
    return scope;
  }
  var windowScope = null;
  function getWindowScope() {
    if (windowScope) return windowScope;
    if (typeof window === "undefined") {
      throw new Error(
        "[Scope] createScope() requires a browser environment. Use createRootScope() instead for Node.js, workers, or SSR."
      );
    }
    windowScope = createScopeInternal(null);
    const disposeAll = () => {
      if (!windowScope) return;
      windowScope.dispose();
      windowScope = null;
    };
    window.addEventListener("pagehide", disposeAll, { once: true });
    window.addEventListener("beforeunload", disposeAll, { once: true });
    return windowScope;
  }
  function createScope(options) {
    var _a;
    const root = getWindowScope();
    return createScopeInternal(root, (_a = options == null ? void 0 : options.debug) != null ? _a : false);
  }
  function createRootScope(options) {
    var _a;
    return createScopeInternal(null, (_a = options == null ? void 0 : options.debug) != null ? _a : false);
  }
  function isScopeDisposed(scope) {
    return scope.signal.aborted;
  }

  // src/core/emitter.ts
  var consoleLogger = {
    log: (msg) => console.log(msg),
    warn: (msg) => console.warn(msg),
    error: (msg, err) => console.error(msg, err)
  };
  var TypedEmitter = class {
    /**
     * @param options.debug        - Enable debug/leak logging. Dev only — disable in production.
     * @param options.logger       - Custom logger. Defaults to console.
     * @param options.maxListeners - Warn threshold per event (dev only). Default: 50.
     */
    constructor(options) {
      this.events = /* @__PURE__ */ new Map();
      var _a, _b, _c;
      this.debugMode = (_a = options == null ? void 0 : options.debug) != null ? _a : false;
      this.logger = (_b = options == null ? void 0 : options.logger) != null ? _b : consoleLogger;
      this.maxListeners = (_c = options == null ? void 0 : options.maxListeners) != null ? _c : 50;
    }
    /**
     * Register an event listener.
     *
     * Returns a DisposeFn that removes the listener when called.
     * Pass a Scope to auto-remove when the scope is disposed.
     */
    on(event, fn, scope) {
      let set = this.events.get(event);
      if (!set) {
        set = /* @__PURE__ */ new Set();
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
        set.delete(fn);
        if (set.size === 0) {
          this.events.delete(event);
        }
        if (this.debugMode) {
          this.logger.log(
            `[Emitter] Listener removed for "${String(event)}" (remaining: ${set.size})`
          );
        }
      };
      scope == null ? void 0 : scope.onDispose(cleanup);
      return cleanup;
    }
    /**
     * Register a one-time event listener.
     *
     * The listener is removed *before* the handler executes.
     * If the handler throws, the listener is already gone — intentional.
     * There is no retry semantics. Use `on()` if you need to control removal yourself.
     */
    once(event, fn, scope) {
      const wrapper = (...args) => {
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
    onceAsync(event, scope) {
      return new Promise((resolve) => {
        this.once(event, (...args) => resolve(args), scope);
      });
    }
    /**
     * Emit an event synchronously to all registered listeners.
     *
     * Errors are isolated per handler — one failure does not stop others.
     * If you need to know when handlers have finished async work, use emitAsync().
     */
    emit(event, ...args) {
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
    async emitAsync(event, ...args) {
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
      const errors = results.filter((r) => r.status === "rejected").map((r) => r.reason);
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
    off(event) {
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
    clear() {
      const count = this.events.size;
      this.events.clear();
      if (this.debugMode && count > 0) {
        this.logger.log(
          `[Emitter] Cleared all listeners for ${count} event(s)`
        );
      }
    }
    hasListeners(event) {
      var _a, _b;
      return ((_b = (_a = this.events.get(event)) == null ? void 0 : _a.size) != null ? _b : 0) > 0;
    }
    listenerCount(event) {
      var _a, _b;
      return (_b = (_a = this.events.get(event)) == null ? void 0 : _a.size) != null ? _b : 0;
    }
    eventNames() {
      return Array.from(this.events.keys());
    }
    setDebug(enabled) {
      this.debugMode = enabled;
    }
  };
  var Emitter = TypedEmitter;

  // src/core/fetch.ts
  var inFlightByScope = /* @__PURE__ */ new WeakMap();
  function requestKey(url, init) {
    var _a, _b;
    const method = (_b = (_a = init == null ? void 0 : init.method) == null ? void 0 : _a.toUpperCase()) != null ? _b : "GET";
    const body = method !== "GET" && typeof (init == null ? void 0 : init.body) === "string" ? `:${init.body}` : "";
    return `${method}:${url}${body}`;
  }
  async function fetchJson(url, options = {}) {
    const {
      scope,
      timeout,
      retryOnFailure = 0,
      retryDelay = 0,
      dedupe = false,
      init,
      parse
    } = options;
    if (dedupe && scope) {
      let inFlight = inFlightByScope.get(scope);
      if (!inFlight) {
        inFlight = /* @__PURE__ */ new Map();
        inFlightByScope.set(scope, inFlight);
      }
      const key = requestKey(url, init);
      const existing = inFlight.get(key);
      if (existing) return existing;
      const promise = executeWithRetry({
        url,
        init,
        parse,
        timeout,
        retryOnFailure,
        retryDelay,
        scope
      });
      inFlight.set(key, promise);
      const cleanup = () => inFlight.delete(key);
      promise.then(cleanup, cleanup);
      scope.onDispose(cleanup);
      return promise;
    }
    return executeWithRetry({
      url,
      init,
      parse,
      timeout,
      retryOnFailure,
      retryDelay,
      scope
    });
  }
  async function executeWithRetry(opts) {
    const { url, init, parse, timeout, retryOnFailure, retryDelay, scope } = opts;
    let currentController = null;
    const onScopeAbort = () => currentController == null ? void 0 : currentController.abort();
    if (scope) {
      if (scope.signal.aborted) {
        throw new DOMException("Scope already disposed", "AbortError");
      }
      scope.signal.addEventListener("abort", onScopeAbort, { once: true });
    }
    try {
      let attempt = 0;
      while (true) {
        const controller = new AbortController();
        currentController = controller;
        let timeoutId;
        if (typeof timeout === "number") {
          timeoutId = setTimeout(() => controller.abort(), timeout);
        }
        try {
          const res = await fetch(url, { ...init, signal: controller.signal });
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
          } else {
            const json = await res.json();
            return parse ? parse(json) : json;
          }
        } catch (err) {
          if (isAbortError(err)) throw err;
          attempt++;
          if (attempt > retryOnFailure) throw err;
          if (retryDelay > 0) {
            await abortableDelay(retryDelay, scope == null ? void 0 : scope.signal);
          }
          if (scope == null ? void 0 : scope.signal.aborted) throw new DOMException("Scope disposed during retry", "AbortError");
        } finally {
          currentController = null;
          if (timeoutId !== void 0) clearTimeout(timeoutId);
        }
      }
    } finally {
      if (scope) {
        scope.signal.removeEventListener("abort", onScopeAbort);
      }
    }
  }
  function abortableDelay(ms, signal) {
    return new Promise((resolve) => {
      if (signal == null ? void 0 : signal.aborted) {
        resolve();
        return;
      }
      const timeoutId = setTimeout(resolve, ms);
      signal == null ? void 0 : signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timeoutId);
          resolve();
        },
        { once: true }
      );
    });
  }
  function isAbortError(error) {
    return error instanceof Error && (error.name === "AbortError" || error.code === 20);
  }

  // src/core/refresh.ts
  function createRefresh(fn, opts) {
    const {
      interval,
      scope,
      immediate = true,
      startPaused = false,
      onError,
      maxRetries = 0,
      backoff = false,
      onDebug
    } = opts;
    if (!(interval > 0)) {
      throw new Error(
        `[Refresh] interval must be a positive number, got: ${interval}`
      );
    }
    let stopped = false;
    let paused = startPaused;
    let executing = false;
    let consecutiveErrors = 0;
    let timeoutId;
    let currentAbort = null;
    const debug = (msg) => onDebug == null ? void 0 : onDebug(`[Refresh] ${msg}`);
    const calculateDelay = () => {
      if (!backoff || consecutiveErrors === 0) return interval;
      return interval * Math.min(2 ** consecutiveErrors, 10);
    };
    const clearScheduled = () => {
      if (timeoutId !== void 0) {
        clearTimeout(timeoutId);
        timeoutId = void 0;
      }
    };
    const schedule = (delay) => {
      clearScheduled();
      timeoutId = setTimeout(tick, delay);
      debug(`Next tick in ${delay}ms`);
    };
    const tick = async () => {
      if (stopped || paused) return;
      if (executing) {
        debug("Skipped tick: previous execution still running");
        return;
      }
      const abort = new AbortController();
      currentAbort = abort;
      executing = true;
      debug("Tick started");
      try {
        await fn(abort.signal);
        consecutiveErrors = 0;
        debug("Tick completed");
      } catch (error) {
        if (isAbortError2(error)) {
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
    const pause = () => {
      if (stopped || paused) return;
      paused = true;
      clearScheduled();
      debug("Paused");
    };
    const resume = () => {
      if (stopped || !paused) return;
      paused = false;
      debug("Resumed");
      tick();
    };
    const stop = () => {
      if (stopped) return;
      stopped = true;
      paused = false;
      clearScheduled();
      currentAbort == null ? void 0 : currentAbort.abort();
      currentAbort = null;
      debug("Stopped");
    };
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
      isPaused: () => paused,
      isExecuting: () => executing
    };
  }
  function isAbortError2(error) {
    return error instanceof Error && (error.name === "AbortError" || error.code === 20);
  }

  // src/data/model.ts
  var Model = class {
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
    constructor(initial, scope) {
      this.emitter = new TypedEmitter();
      this.initial = { ...initial };
      this.data = { ...initial };
      this.scope = scope != null ? scope : createRootScope();
      this.scope.onDispose(() => this._destroy());
    }
    // ── Read ─────────────────────────────────────────────────────────────────
    get(key) {
      this.checkDestroyed();
      return this.data[key];
    }
    getAll() {
      this.checkDestroyed();
      return { ...this.data };
    }
    /**
     * True if the current state differs from the initial state.
     * Shallow comparison.
     */
    isDirty() {
      this.checkDestroyed();
      return Object.keys(this.initial).some(
        (key) => this.initial[key] !== this.data[key]
      );
    }
    has(key, value) {
      this.checkDestroyed();
      return this.data[key] === value;
    }
    // ── Write ────────────────────────────────────────────────────────────────
    /**
     * Apply a partial patch to the model state.
     * Only changed keys are applied. Emits "change" only if something changed.
     * Returns true if any key changed, false if state was already identical.
     */
    set(patch) {
      this.checkDestroyed();
      const changes = {};
      let hasChanges = false;
      for (const key of Object.keys(patch)) {
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
    reset() {
      this.checkDestroyed();
      const resetData = { ...this.initial };
      const hasChanges = Object.keys(resetData).some(
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
    onChange(fn, scope) {
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
    watch(key, fn, scope) {
      this.checkDestroyed();
      return this.emitter.on(
        "change",
        (patch) => {
          if (key in patch) {
            fn(patch[key]);
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
    async fetch(url, timeout) {
      this.checkDestroyed();
      const patch = await fetchJson(url, {
        scope: this.scope,
        timeout
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
    autoRefresh(url, options) {
      var _a;
      this.checkDestroyed();
      const refreshScope = (_a = options.scope) != null ? _a : this.scope;
      return createRefresh(
        async (signal) => {
          if (this.isDestroyed()) return;
          const patch = await fetchJson(url, {
            scope: refreshScope
          });
          this.set(patch);
        },
        {
          interval: options.interval,
          scope: refreshScope,
          immediate: options.immediate,
          startPaused: options.startPaused,
          onError: options.onError,
          maxRetries: options.maxRetries,
          backoff: options.backoff,
          onDebug: options.onDebug
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
    destroy() {
      this.scope.dispose();
    }
    isDestroyed() {
      return this.scope.signal.aborted;
    }
    _destroy() {
      this.emitter.clear();
    }
    checkDestroyed() {
      if (this.isDestroyed()) {
        throw new Error("[Model] Cannot use a destroyed model");
      }
    }
  };

  // src/data/collection.ts
  var Collection = class {
    /**
     * Create a collection, optionally seeded with initial items.
     *
     * @param initial - Initial items. Shallow-cloned on construction.
     * @param scope   - Scope that owns this collection. When the scope is
     *                  disposed, the collection is destroyed automatically.
     *                  If omitted, a root scope is created — you are
     *                  responsible for calling destroy() to clean up.
     *
     * ⚠️ Scope ownership: passing an external scope grants lifecycle ownership
     * to this collection. Calling destroy() disposes that scope, which affects
     * all other resources tied to it. Use a dedicated child scope per
     * collection if you need independent lifetimes:
     *   `new Collection(items, parentScope.createChild())`
     */
    constructor(initial = [], scope) {
      this.items = [];
      this.emitter = new TypedEmitter();
      this.items = [...initial];
      this.scope = scope != null ? scope : createRootScope();
      this.scope.onDispose(() => this._destroy());
    }
    // ── Read ─────────────────────────────────────────────────────────────────
    getAll() {
      this.checkDestroyed();
      return [...this.items];
    }
    get length() {
      this.checkDestroyed();
      return this.items.length;
    }
    at(index) {
      this.checkDestroyed();
      return this.items[index];
    }
    find(predicate) {
      this.checkDestroyed();
      return this.items.find(predicate);
    }
    findIndex(predicate) {
      this.checkDestroyed();
      return this.items.findIndex(predicate);
    }
    filter(predicate) {
      this.checkDestroyed();
      return this.items.filter(predicate);
    }
    map(fn) {
      this.checkDestroyed();
      return this.items.map(fn);
    }
    forEach(fn) {
      this.checkDestroyed();
      this.items.forEach(fn);
    }
    some(predicate) {
      this.checkDestroyed();
      return this.items.some(predicate);
    }
    every(predicate) {
      this.checkDestroyed();
      return this.items.every(predicate);
    }
    // ── Write ────────────────────────────────────────────────────────────────
    add(...items) {
      this.checkDestroyed();
      this.items.push(...items);
      this.emitter.emit("add", items);
    }
    /**
     * Remove all items matching the predicate.
     * Iterates backwards to avoid index-shift bugs during splice.
     * Returns the removed items in their original order.
     * Emits "remove" only if at least one item was removed.
     */
    remove(predicate) {
      this.checkDestroyed();
      const removed = [];
      for (let i = this.items.length - 1; i >= 0; i--) {
        if (predicate(this.items[i], i)) {
          removed.unshift(this.items[i]);
          this.items.splice(i, 1);
        }
      }
      if (removed.length > 0) {
        this.emitter.emit("remove", removed);
      }
      return removed;
    }
    removeAt(index) {
      this.checkDestroyed();
      if (index < 0 || index >= this.items.length) return void 0;
      const [item] = this.items.splice(index, 1);
      this.emitter.emit("remove", [item]);
      return item;
    }
    /**
     * Apply a shallow patch to all items matching the predicate.
     * Only items that actually change are included in the "update" emission.
     *
     * Patch is applied shallowly — consistent with Model.set() semantics.
     * Returns the items that were updated.
     *
     * @example
     * collection.update(
     *   (user) => user.id === 42,
     *   { name: "Alice" }
     * );
     */
    update(predicate, patch) {
      this.checkDestroyed();
      const updated = [];
      for (let i = 0; i < this.items.length; i++) {
        if (predicate(this.items[i], i)) {
          const next = { ...this.items[i], ...patch };
          const changed = Object.keys(patch).some(
            (key) => patch[key] !== this.items[i][key]
          );
          if (changed) {
            this.items[i] = next;
            updated.push(next);
          }
        }
      }
      if (updated.length > 0) {
        this.emitter.emit("update", updated);
      }
      return updated;
    }
    /**
     * Move an item from one index to another.
     * Emits "sort" to signal an ordering change.
     * No-op if either index is out of bounds or indices are equal.
     */
    move(fromIndex, toIndex) {
      this.checkDestroyed();
      if (fromIndex === toIndex || fromIndex < 0 || fromIndex >= this.items.length || toIndex < 0 || toIndex >= this.items.length) return;
      const [item] = this.items.splice(fromIndex, 1);
      this.items.splice(toIndex, 0, item);
      this.emitter.emit("sort");
    }
    sort(compareFn) {
      this.checkDestroyed();
      this.items.sort(compareFn);
      this.emitter.emit("sort");
    }
    /**
     * Replace all items. Emits "reset" with the new item list.
     */
    reset(items) {
      this.checkDestroyed();
      this.items = [...items];
      this.emitter.emit("reset", [...this.items]);
    }
    /**
     * Remove all items. No-op if already empty.
     * Emits "reset" with an empty array.
     */
    clear() {
      this.checkDestroyed();
      if (this.items.length > 0) {
        this.items = [];
        this.emitter.emit("reset", []);
      }
    }
    // ── Network ──────────────────────────────────────────────────────────────
    /**
     * Fetch an item array from a URL and replace the collection contents.
     * Uses the collection's own scope — aborted if the collection is destroyed.
     * Returns the full collection after reset.
     */
    async fetch(url, timeout) {
      this.checkDestroyed();
      const items = await fetchJson(url, {
        scope: this.scope,
        timeout
      });
      this.reset(items);
      return this.getAll();
    }
    /**
     * Start a sequential auto-refresh loop that keeps the collection up to date.
     *
     * Returns a RefreshController — use pause(), resume(), stop() to control
     * the loop without destroying the collection.
     *
     * If no scope is provided in options, the collection's own scope owns the
     * loop — it stops automatically when the collection is destroyed.
     *
     * ⚠️ Custom scope ownership: see AutoRefreshOptions.scope for details.
     */
    autoRefresh(url, options) {
      var _a;
      this.checkDestroyed();
      const refreshScope = (_a = options.scope) != null ? _a : this.scope;
      return createRefresh(
        async () => {
          if (this.isDestroyed()) return;
          const items = await fetchJson(url, { scope: refreshScope });
          this.reset(items);
        },
        {
          interval: options.interval,
          scope: refreshScope,
          immediate: options.immediate,
          startPaused: options.startPaused,
          onError: options.onError,
          maxRetries: options.maxRetries,
          backoff: options.backoff,
          onDebug: options.onDebug
        }
      );
    }
    // ── Observe ──────────────────────────────────────────────────────────────
    onAdd(fn, scope) {
      this.checkDestroyed();
      return this.emitter.on("add", fn, scope);
    }
    onRemove(fn, scope) {
      this.checkDestroyed();
      return this.emitter.on("remove", fn, scope);
    }
    onUpdate(fn, scope) {
      this.checkDestroyed();
      return this.emitter.on("update", fn, scope);
    }
    onReset(fn, scope) {
      this.checkDestroyed();
      return this.emitter.on("reset", fn, scope);
    }
    onSort(fn, scope) {
      this.checkDestroyed();
      return this.emitter.on("sort", fn, scope);
    }
    /**
     * Listen for any data change — add, remove, update, or reset.
     * Sort is intentionally excluded: sort changes ordering, not data.
     * Use onSort() separately if you need to react to ordering changes.
     *
     * Returns a single DisposeFn that removes all four listeners at once.
     */
    onChange(fn, scope) {
      this.checkDestroyed();
      const c1 = this.onAdd(() => fn(), scope);
      const c2 = this.onRemove(() => fn(), scope);
      const c3 = this.onUpdate(() => fn(), scope);
      const c4 = this.onReset(() => fn(), scope);
      return () => {
        c1();
        c2();
        c3();
        c4();
      };
    }
    // ── Lifecycle ────────────────────────────────────────────────────────────
    /**
     * Destroy the collection explicitly.
     * Disposes the collection's scope — stops all refresh loops, aborts
     * in-flight fetches, and clears all listeners.
     *
     * ⚠️ If a scope was passed at construction, this disposes that scope too.
     * Idempotent — safe to call multiple times.
     */
    destroy() {
      this.scope.dispose();
    }
    isDestroyed() {
      return this.scope.signal.aborted;
    }
    _destroy() {
      this.items = [];
      this.emitter.clear();
    }
    checkDestroyed() {
      if (this.isDestroyed()) {
        throw new Error("[Collection] Cannot use a destroyed collection");
      }
    }
  };

  // src/dom/elements.ts
  var Elements = class _Elements {
    constructor(nodes) {
      this._nodes = nodes;
    }
    // ── Collection access ─────────────────────────────────────────────────────
    get length() {
      return this._nodes.length;
    }
    /**
     * Returns a shallow copy of the underlying Element array.
     * Mutations to the returned array do not affect this wrapper.
     */
    toArray() {
      return [...this._nodes];
    }
    each(fn) {
      this._nodes.forEach(fn);
      return this;
    }
    get(index = 0) {
      var _a;
      return (_a = this._nodes[index]) != null ? _a : null;
    }
    first() {
      var _a;
      return (_a = this._nodes[0]) != null ? _a : null;
    }
    last() {
      var _a;
      return (_a = this._nodes[this._nodes.length - 1]) != null ? _a : null;
    }
    // ── Traversal ─────────────────────────────────────────────────────────────
    find(selector) {
      const out = [];
      this.each((el2) => {
        out.push(...Array.from(el2.querySelectorAll(selector)));
      });
      return new _Elements(out);
    }
    filter(predicate) {
      if (typeof predicate === "string") {
        return new _Elements(this._nodes.filter((el2) => el2.matches(predicate)));
      }
      return new _Elements(this._nodes.filter(predicate));
    }
    /**
     * Return elements that do NOT match the selector.
     * Inverse of filter(selector).
     */
    not(selector) {
      return new _Elements(this._nodes.filter((el2) => !el2.matches(selector)));
    }
    parent() {
      const parents = [];
      this.each((el2) => {
        if (el2.parentElement) parents.push(el2.parentElement);
      });
      return new _Elements(parents);
    }
    /**
     * Return all sibling elements (excluding the elements themselves).
     */
    siblings() {
      const result = [];
      this.each((el2) => {
        if (el2.parentElement) {
          Array.from(el2.parentElement.children).forEach((sibling) => {
            if (sibling !== el2 && !result.includes(sibling)) {
              result.push(sibling);
            }
          });
        }
      });
      return new _Elements(result);
    }
    closest(selector) {
      const matches = [];
      this.each((el2) => {
        const match = el2.closest(selector);
        if (match) matches.push(match);
      });
      return new _Elements(matches);
    }
    children() {
      const children = [];
      this.each((el2) => {
        children.push(...Array.from(el2.children));
      });
      return new _Elements(children);
    }
    text(value) {
      var _a, _b;
      if (value === void 0) return (_b = (_a = this.get()) == null ? void 0 : _a.textContent) != null ? _b : "";
      return this.each((el2) => {
        el2.textContent = value;
      });
    }
    html(value) {
      var _a, _b;
      if (value === void 0) return (_b = (_a = this.get()) == null ? void 0 : _a.innerHTML) != null ? _b : "";
      return this.each((el2) => {
        el2.innerHTML = value;
      });
    }
    attr(name, value) {
      var _a, _b;
      if (value === void 0) return (_b = (_a = this.get()) == null ? void 0 : _a.getAttribute(name)) != null ? _b : null;
      return this.each((el2) => {
        el2.setAttribute(name, value);
      });
    }
    removeAttr(name) {
      return this.each((el2) => {
        el2.removeAttribute(name);
      });
    }
    data(key, value) {
      var _a;
      if (value === void 0) {
        const el2 = this.get();
        return el2 instanceof HTMLElement ? (_a = el2.dataset[key]) != null ? _a : null : null;
      }
      return this.each((el2) => {
        if (el2 instanceof HTMLElement) el2.dataset[key] = value;
      });
    }
    val(value) {
      if (value === void 0) {
        const el2 = this.get();
        if (el2 instanceof HTMLInputElement || el2 instanceof HTMLTextAreaElement || el2 instanceof HTMLSelectElement) {
          return el2.value;
        }
        return "";
      }
      return this.each((el2) => {
        if (el2 instanceof HTMLInputElement || el2 instanceof HTMLTextAreaElement || el2 instanceof HTMLSelectElement) {
          el2.value = value;
        }
      });
    }
    // ── Events ────────────────────────────────────────────────────────────────
    /**
     * Add an event listener to all elements.
     *
     * If a Scope is provided, listeners are removed automatically when the
     * scope is disposed.
     *
     * ⚠️ Each element in the collection registers its own onDispose cleanup.
     * On a large collection (e.g. 100 elements), this produces 100 onDispose
     * registrations on the scope. This is correct behavior — each element
     * needs its own cleanup — not a leak. Debug mode may warn about cleanup
     * accumulation; this is a known false positive for large element sets.
     */
    on(event, handler, scope) {
      return this.each((el2) => {
        el2.addEventListener(event, handler);
        scope == null ? void 0 : scope.onDispose(() => {
          el2.removeEventListener(event, handler);
        });
      });
    }
    /**
     * Add a one-time event listener to all elements.
     * The listener removes itself after firing once per element.
     */
    once(event, handler) {
      return this.each((el2) => {
        el2.addEventListener(event, handler, { once: true });
      });
    }
    off(event, handler) {
      return this.each((el2) => {
        el2.removeEventListener(event, handler);
      });
    }
    /**
     * Dispatch a CustomEvent on all elements.
     *
     * Defaults to bubbling and cancelable — consistent with native DOM events.
     * Pass `bubbles: false` if you explicitly need a non-bubbling event.
     */
    trigger(event, detail, options) {
      const { bubbles = true, cancelable = true } = options != null ? options : {};
      return this.each((el2) => {
        el2.dispatchEvent(new CustomEvent(event, { detail, bubbles, cancelable }));
      });
    }
    // ── Classes ───────────────────────────────────────────────────────────────
    addClass(classes) {
      const classList = classes.split(" ").filter(Boolean);
      return this.each((el2) => {
        el2.classList.add(...classList);
      });
    }
    removeClass(classes) {
      const classList = classes.split(" ").filter(Boolean);
      return this.each((el2) => {
        el2.classList.remove(...classList);
      });
    }
    toggleClass(classes, force) {
      const classList = classes.split(" ").filter(Boolean);
      return this.each((el2) => {
        classList.forEach((cls) => {
          el2.classList.toggle(cls, force);
        });
      });
    }
    hasClass(className) {
      return this._nodes.some((el2) => el2.classList.contains(className));
    }
    css(property, value) {
      if (typeof property === "string" && value === void 0) {
        const el2 = this.get();
        return el2 instanceof HTMLElement ? getComputedStyle(el2).getPropertyValue(property) : "";
      }
      if (typeof property === "string") {
        return this.each((el2) => {
          if (el2 instanceof HTMLElement) el2.style.setProperty(property, value);
        });
      }
      return this.each((el2) => {
        if (el2 instanceof HTMLElement) {
          Object.entries(property).forEach(([key, val]) => {
            el2.style.setProperty(key, val);
          });
        }
      });
    }
    show() {
      return this.each((el2) => {
        if (el2 instanceof HTMLElement) el2.style.display = "";
      });
    }
    hide() {
      return this.each((el2) => {
        if (el2 instanceof HTMLElement) el2.style.display = "none";
      });
    }
    toggle(show) {
      return this.each((el2) => {
        if (el2 instanceof HTMLElement) {
          const shouldShow = show != null ? show : el2.style.display === "none";
          el2.style.display = shouldShow ? "" : "none";
        }
      });
    }
    /**
     * True if any element in the collection is visible.
     *
     * ⚠️ Uses offsetParent for visibility detection, which returns null for
     * `position: fixed` elements even when they are visible. For fixed
     * elements, check visibility manually via getBoundingClientRect() or
     * getComputedStyle().
     */
    isVisible() {
      return this._nodes.some((el2) => {
        if (el2 instanceof HTMLElement) {
          return el2.style.display !== "none" && el2.offsetParent !== null;
        }
        return false;
      });
    }
    // ── DOM Manipulation ──────────────────────────────────────────────────────
    /**
     * Append content to each element.
     *
     * - string → inserted as HTML via insertAdjacentHTML
     * - Elements → each child is cloned and appended
     * - Element → cloned when this wrapper has multiple targets,
     *             moved (not cloned) when there is exactly one target
     */
    append(content) {
      return this.each((el2) => {
        if (typeof content === "string") {
          el2.insertAdjacentHTML("beforeend", content);
        } else if (content instanceof _Elements) {
          content.each((child) => el2.appendChild(child.cloneNode(true)));
        } else {
          el2.appendChild(
            this._nodes.length > 1 ? content.cloneNode(true) : content
          );
        }
      });
    }
    /**
     * Prepend content to each element.
     *
     * - string → inserted as HTML via insertAdjacentHTML
     * - Elements → each child is cloned and prepended
     * - Element → cloned when this wrapper has multiple targets,
     *             moved (not cloned) when there is exactly one target
     */
    prepend(content) {
      return this.each((el2) => {
        if (typeof content === "string") {
          el2.insertAdjacentHTML("afterbegin", content);
        } else if (content instanceof _Elements) {
          const first = el2.firstChild;
          content.each((child) => {
            el2.insertBefore(child.cloneNode(true), first);
          });
        } else {
          el2.insertBefore(
            this._nodes.length > 1 ? content.cloneNode(true) : content,
            el2.firstChild
          );
        }
      });
    }
    remove() {
      return this.each((el2) => {
        el2.remove();
      });
    }
    empty() {
      return this.each((el2) => {
        el2.innerHTML = "";
      });
    }
    clone(deep = true) {
      return new _Elements(
        this._nodes.map((el2) => el2.cloneNode(deep))
      );
    }
    // ── Focus ─────────────────────────────────────────────────────────────────
    focus() {
      const el2 = this.get();
      if (el2 instanceof HTMLElement) el2.focus();
      return this;
    }
    blur() {
      const el2 = this.get();
      if (el2 instanceof HTMLElement) el2.blur();
      return this;
    }
  };

  // src/dom/el.ts
  function el(input, root) {
    var _a, _b;
    if (typeof document === "undefined") {
      throw new Error(
        "[el] DOM is not available in this environment. el() requires a browser context."
      );
    }
    if (input instanceof Elements) {
      return input;
    }
    if (typeof input === "string") {
      const selector = input.trim();
      if (!selector) {
        return new Elements([]);
      }
      try {
        return new Elements(
          Array.from(
            (root != null ? root : document).querySelectorAll(selector)
          )
        );
      } catch (error) {
        console.error(`[el] Invalid selector: "${selector}"`, error);
        return new Elements([]);
      }
    }
    if (input instanceof Element) {
      return new Elements([input]);
    }
    if (input instanceof NodeList) {
      const elements = [];
      input.forEach((node) => {
        if (node instanceof Element) elements.push(node);
      });
      return new Elements(elements);
    }
    if (input instanceof HTMLCollection) {
      return new Elements(Array.from(input));
    }
    if (Array.isArray(input)) {
      const elements = input.filter((item) => item instanceof Element);
      if (elements.length !== input.length) {
        console.warn(
          `[el] ${input.length - elements.length} item(s) in array were not Elements and were filtered out`
        );
      }
      return new Elements(elements);
    }
    const typeName = input != null && typeof input === "object" ? (_b = (_a = input.constructor) == null ? void 0 : _a.name) != null ? _b : "unknown object" : typeof input;
    console.warn(`[el] Unrecognized input type: ${typeName}`);
    return new Elements([]);
  }
  function elFromHtml(html) {
    if (typeof document === "undefined") {
      throw new Error(
        "[elFromHtml] DOM is not available in this environment. elFromHtml() requires a browser context."
      );
    }
    const template = document.createElement("template");
    template.innerHTML = html.trim();
    return new Elements(Array.from(template.content.children));
  }
  function isElements(input) {
    return input instanceof Elements;
  }

  // src/view/view.ts
  var View = class {
    constructor(root, model, options = {}) {
      this.root = root;
      this.model = model;
      this._children = /* @__PURE__ */ new Set();
      const { autoDestroy = true, parentScope } = options;
      this.scope = parentScope ? parentScope.createChild() : createScope();
      this.scope.onDispose(() => {
        this._children.clear();
      });
      if (autoDestroy) {
        this._setupAutoDestroy();
      }
      this.init();
    }
    // ── Lifecycle hooks ───────────────────────────────────────────────────────
    /**
     * Called once during construction after scope is set up.
     * Override to wire events, create children, bind model.
     */
    init() {
    }
    /**
     * Override to update DOM from current model state.
     * Not called automatically — invoke manually or wire via onChange:
     *   `this.model.onChange(() => this.render(), this.scope)`
     */
    render() {
    }
    // ── DOM helpers ───────────────────────────────────────────────────────────
    /** Query within the view's root element. */
    $(selector) {
      return el(selector, this.root);
    }
    /** Wrap the view's root element. */
    $root() {
      return el(this.root);
    }
    /** Focus the view's root element. */
    focus() {
      const r = this.root;
      if (r instanceof HTMLElement) r.focus();
      return this;
    }
    // ── Events ────────────────────────────────────────────────────────────────
    /**
     * Bind an event listener to the view's root element.
     * Automatically removed when the view's scope is disposed.
     */
    on(event, handler) {
      this.checkDestroyed();
      this.$root().on(event, handler, this.scope);
    }
    /**
     * Bind an event listener to `document`.
     * Automatically removed when the view's scope is disposed.
     * Use for global keyboard shortcuts, clicks outside, etc.
     */
    onDocument(event, handler) {
      this.checkDestroyed();
      document.addEventListener(event, handler);
      this.scope.onDispose(() => document.removeEventListener(event, handler));
    }
    /**
     * Bind an event listener to `window`.
     * Automatically removed when the view's scope is disposed.
     * Use for resize, scroll, hashchange, etc.
     */
    onWindow(event, handler) {
      this.checkDestroyed();
      window.addEventListener(event, handler);
      this.scope.onDispose(() => window.removeEventListener(event, handler));
    }
    /**
     * Dispatch a CustomEvent from the view's root element.
     * Bubbles and is cancelable by default — consistent with native DOM events.
     */
    emit(event, detail) {
      this.checkDestroyed();
      this.$root().trigger(event, detail);
    }
    // ── Children ──────────────────────────────────────────────────────────────
    /**
     * Create a child view owned by this view's scope.
     * The child is destroyed automatically when this view is destroyed.
     *
     * @example
     * const header = this.createChild(HeaderView, this.$(".header").get()!);
     */
    createChild(ViewClass, root, model) {
      this.checkDestroyed();
      const child = new ViewClass(root, model, {
        parentScope: this.scope,
        autoDestroy: false
      });
      this._children.add(child);
      child.scope.onDispose(() => this._children.delete(child));
      return child;
    }
    /**
     * Create child views for each element matching a selector.
     * An optional modelFn maps each element to a model instance.
     */
    createChildren(ViewClass, selector, modelFn) {
      this.checkDestroyed();
      const views = [];
      this.$(selector).each((element, index) => {
        const model = modelFn ? modelFn(element, index) : void 0;
        views.push(this.createChild(ViewClass, element, model));
      });
      return views;
    }
    // ── Visibility ────────────────────────────────────────────────────────────
    show() {
      this.checkDestroyed();
      this.$root().show();
      return this;
    }
    hide() {
      this.checkDestroyed();
      this.$root().hide();
      return this;
    }
    toggle(force) {
      this.checkDestroyed();
      this.$root().toggle(force);
      return this;
    }
    isVisible() {
      return this.$root().isVisible();
    }
    // ── Lifecycle ─────────────────────────────────────────────────────────────
    /**
     * Destroy this view.
     * Disposes the view's scope, which cascades to all child views via the
     * scope tree. No manual child iteration needed.
     *
     * Idempotent — safe to call multiple times.
     */
    destroy() {
      this.scope.dispose();
    }
    /**
     * True if this view has been destroyed.
     */
    isDestroyed() {
      return this.scope.signal.aborted;
    }
    getRoot() {
      return this.root;
    }
    getModel() {
      return this.model;
    }
    _setupAutoDestroy() {
      if (!this.root.parentElement) {
        console.warn(
          "[View] autoDestroy is enabled but root has no parentElement. The MutationObserver cannot attach. Ensure root is in the DOM before constructing the view, or disable autoDestroy."
        );
        return;
      }
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          for (const removed of Array.from(mutation.removedNodes)) {
            if (removed === this.root || removed instanceof Element && removed.contains(this.root)) {
              this.destroy();
              observer.disconnect();
              return;
            }
          }
        }
      });
      observer.observe(this.root.parentElement, {
        childList: true,
        subtree: true
      });
      this.scope.onDispose(() => observer.disconnect());
    }
    checkDestroyed() {
      if (this.isDestroyed()) {
        throw new Error("[View] Cannot use a destroyed view");
      }
    }
  };
  function createView(ViewClass, root, model, options) {
    if (typeof document === "undefined") {
      throw new Error(
        "[createView] DOM is not available in this environment. createView() requires a browser context."
      );
    }
    const element = typeof root === "string" ? document.querySelector(root) : root;
    if (!element) {
      throw new Error(`[createView] Element not found: ${root}`);
    }
    return new ViewClass(element, model, options);
  }
  return __toCommonJS(index_exports);
})();
