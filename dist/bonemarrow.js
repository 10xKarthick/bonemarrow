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
    Model: () => Model,
    View: () => View,
    createScope: () => createScope,
    el: () => el,
    fetchJson: () => fetchJson
  });

  // src/core/scope.ts
  function createScopeInternal(parent) {
    const controller = new AbortController();
    const cleanups = [];
    const children = /* @__PURE__ */ new Set();
    let disposed = false;
    const scope = {
      signal: controller.signal,
      onDispose(fn) {
        if (disposed) {
          fn();
          return;
        }
        cleanups.push(fn);
      },
      createChild() {
        const child = createScopeInternal(scope);
        children.add(child);
        child.onDispose(() => children.delete(child));
        return child;
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        for (const child of children) child.dispose();
        children.clear();
        controller.abort();
        for (const fn of cleanups) fn();
        cleanups.length = 0;
      }
    };
    parent == null ? void 0 : parent.onDispose(() => scope.dispose());
    return scope;
  }
  var windowScope = null;
  function getWindowScope() {
    if (windowScope) return windowScope;
    windowScope = createScopeInternal(null);
    const disposeAll = () => windowScope == null ? void 0 : windowScope.dispose();
    window.addEventListener("pagehide", disposeAll);
    window.addEventListener("beforeunload", disposeAll);
    return windowScope;
  }
  function createScope() {
    return getWindowScope().createChild();
  }

  // src/core/fetch.ts
  function requestKey(url, init) {
    var _a;
    return `${(_a = init == null ? void 0 : init.method) != null ? _a : "GET"}:${url}`;
  }
  async function fetchJson(url, options = {}) {
    var _a;
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
    const internalScope = scope;
    let inFlight;
    let key;
    if (dedupe && internalScope) {
      inFlight = (_a = internalScope._inFlight) != null ? _a : internalScope._inFlight = /* @__PURE__ */ new Map();
      key = requestKey(url, init);
      const existing = inFlight == null ? void 0 : inFlight.get(key);
      if (existing) {
        return existing;
      }
    }
    const promise = (async () => {
      let attempt = 0;
      while (true) {
        const controller = new AbortController();
        if (abort && scope) {
          scope.signal.addEventListener("abort", () => controller.abort(), { once: true });
        }
        let timeoutId;
        if (typeof timeout === "number") {
          timeoutId = window.setTimeout(() => controller.abort(), timeout);
        }
        try {
          const res = await fetch(url, {
            ...init,
            signal: controller.signal
          });
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
          }
          const json = await res.json();
          return parse ? parse(json) : json;
        } catch (err) {
          attempt++;
          if (err instanceof DOMException && err.name === "AbortError") throw err;
          if (attempt > retryOnFailure) throw err;
          if (retryDelay > 0) {
            await new Promise((resolve) => setTimeout(resolve, timeoutId));
          }
        } finally {
          if (timeoutId) clearTimeout(timeoutId);
        }
      }
    })();
    if (inFlight && key && internalScope) {
      inFlight.set(key, promise);
      const cleanup = () => inFlight.delete(key);
      promise.then(cleanup, cleanup);
      internalScope.onDispose(cleanup);
    }
    return promise;
  }

  // src/core/emitter.ts
  var Emitter = class {
    constructor() {
      this.events = /* @__PURE__ */ new Map();
    }
    on(event, fn) {
      let set = this.events.get(event);
      if (!set) {
        set = /* @__PURE__ */ new Set();
        this.events.set(event, set);
      }
      set.add(fn);
      return () => set.delete(fn);
    }
    emit(event, ...args) {
      var _a;
      (_a = this.events.get(event)) == null ? void 0 : _a.forEach((fn) => fn(...args));
    }
    clear() {
      this.events.clear();
    }
  };

  // src/refresh/sequentialRefresh.ts
  function startSequentialRefresh(fn, opts) {
    const { interval, scope, immediate = true } = opts;
    let stopped = false;
    let timeoutId;
    const loop = async () => {
      if (stopped) return;
      try {
        await fn();
      } catch {
      }
      if (stopped) return;
      timeoutId = window.setTimeout(loop, interval);
    };
    immediate ? loop() : timeoutId = window.setTimeout(loop, interval);
    const stop = () => {
      stopped = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
    scope.onDispose(stop);
    return stop;
  }

  // src/data/model.ts
  var Model = class {
    constructor(initial) {
      this.emitter = new Emitter();
      this.data = { ...initial };
    }
    get(key) {
      return this.data[key];
    }
    set(patch) {
      Object.assign(this.data, patch);
      this.emitter.emit("change", patch);
    }
    onChange(fn) {
      return this.emitter.on("change", fn);
    }
    async fetch(url, options) {
      const patch = await fetchJson(url, options);
      this.set(patch);
      return this.data;
    }
    autoRefresh(url, options) {
      return startSequentialRefresh(
        () => this.fetch(url, { ...options.fetch, scope: options.scope }),
        options
      );
    }
    destroy() {
      this.emitter.clear();
    }
  };

  // src/data/collection.ts
  var Collection = class {
    constructor() {
      this.items = [];
      this.emitter = new Emitter();
    }
    async fetch(url, options) {
      const items = await fetchJson(url, options);
      this.items = items;
      this.emitter.emit("reset", items);
      return items;
    }
    onReset(fn) {
      return this.emitter.on("reset", fn);
    }
    autoRefresh(url, opts) {
      return startSequentialRefresh(
        () => this.fetch(url, { ...opts.fetch, scope: opts.scope }),
        opts
      );
    }
    destroy() {
      this.items.length = 0;
      this.emitter.clear();
    }
  };

  // src/dom/elements.ts
  var Elements = class _Elements {
    constructor(nodes) {
      this.nodes = nodes;
    }
    each(fn) {
      this.nodes.forEach(fn);
      return this;
    }
    get(index = 0) {
      var _a;
      return (_a = this.nodes[index]) != null ? _a : null;
    }
    find(selector) {
      const out = [];
      this.each((el2) => {
        out.push(...Array.from(el2.querySelectorAll(selector)));
      });
      return new _Elements(out);
    }
    on(event, handler, scope) {
      return this.each((el2) => {
        el2.addEventListener(event, handler);
        scope == null ? void 0 : scope.onDispose(
          () => el2.removeEventListener(event, handler)
        );
      });
    }
    text(value) {
      var _a, _b;
      if (value === void 0) {
        return (_b = (_a = this.get()) == null ? void 0 : _a.textContent) != null ? _b : "";
      }
      return this.each((el2) => el2.textContent = value);
    }
    addClass(cls) {
      return this.each((el2) => el2.classList.add(cls));
    }
    removeClass(cls) {
      return this.each((el2) => el2.classList.remove(cls));
    }
  };

  // src/dom/el.ts
  function el(input, root) {
    if (typeof input === "string") {
      return new Elements(
        Array.from((root != null ? root : document).querySelectorAll(input))
      );
    }
    if (input instanceof Element) {
      return new Elements([input]);
    }
    if (input instanceof NodeList) {
      return new Elements(Array.from(input));
    }
    return new Elements(input);
  }

  // src/view/view.ts
  var View = class {
    constructor(root, model) {
      this.root = root;
      this.model = model;
      this.scope = createScope();
      this.init();
    }
    init() {
    }
    $(selector) {
      return el(selector, this.root);
    }
    destroy() {
      var _a, _b;
      this.scope.dispose();
      (_b = (_a = this.model) == null ? void 0 : _a.destroy) == null ? void 0 : _b.call(_a);
    }
  };
  return __toCommonJS(index_exports);
})();
