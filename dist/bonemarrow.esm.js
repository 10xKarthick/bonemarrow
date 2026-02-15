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
        try {
          fn();
        } catch (error) {
          console.error("[Scope] Error in dispose callback:", error);
        }
        return;
      }
      cleanups.push(fn);
    },
    createChild() {
      if (disposed) {
        console.warn(
          "[Scope] Attempted to create child from disposed scope"
        );
        const deadScope = createScopeInternal(null);
        deadScope.dispose();
        return deadScope;
      }
      const child = createScopeInternal(scope);
      children.add(child);
      child.onDispose(() => children.delete(child));
      return child;
    },
    dispose() {
      if (disposed)
        return;
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
          console.error(
            "[Scope] Error in cleanup function:",
            error
          );
        }
      }
      cleanups.length = 0;
      if (scope._inFlight) {
        scope._inFlight.clear();
        delete scope._inFlight;
      }
    }
  };
  parent == null ? void 0 : parent.onDispose(() => scope.dispose());
  return scope;
}
var windowScope = null;
function getWindowScope() {
  if (windowScope)
    return windowScope;
  windowScope = createScopeInternal(null);
  const disposeAll = () => {
    if (!windowScope)
      return;
    windowScope.dispose();
    windowScope = null;
  };
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
    const existing = inFlight.get(key);
    if (existing) {
      return existing;
    }
  }
  const promise = (async () => {
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
      let timeoutId;
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
        return parse ? parse(json) : json;
      } catch (err) {
        attempt++;
        if (err instanceof DOMException && err.name === "AbortError") {
          throw err;
        }
        if (attempt > retryOnFailure) {
          throw err;
        }
        if (retryDelay > 0) {
          await new Promise(
            (resolve) => setTimeout(resolve, retryDelay)
          );
        }
      } finally {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      }
    }
  })();
  if (inFlight && key && internalScope) {
    inFlight.set(key, promise);
    const cleanup = () => {
      inFlight.delete(key);
    };
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
  on(event, fn, scope) {
    let set = this.events.get(event);
    if (!set) {
      set = /* @__PURE__ */ new Set();
      this.events.set(event, set);
    }
    set.add(fn);
    let disposed = false;
    const cleanup = () => {
      if (disposed)
        return;
      disposed = true;
      set.delete(fn);
      if (set.size === 0) {
        this.events.delete(event);
      }
    };
    scope == null ? void 0 : scope.onDispose(cleanup);
    return cleanup;
  }
  once(event, fn, scope) {
    const wrapper = (...args) => {
      cleanup();
      fn(...args);
    };
    const cleanup = this.on(event, wrapper, scope);
    return cleanup;
  }
  emit(event, ...args) {
    const handlers = this.events.get(event);
    if (!handlers || handlers.size === 0)
      return;
    const handlersArray = Array.from(handlers);
    for (const fn of handlersArray) {
      try {
        fn(...args);
      } catch (error) {
        console.error(
          `Error in event handler for "${event}":`,
          error
        );
      }
    }
  }
  off(event) {
    this.events.delete(event);
  }
  clear() {
    this.events.clear();
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
};

// src/refresh/sequentialRefresh.ts
function startSequentialRefresh(fn, opts) {
  const {
    interval,
    scope,
    immediate = true,
    onError,
    maxRetries = 0,
    backoff = false
  } = opts;
  let stopped = false;
  let timeoutId;
  let consecutiveErrors = 0;
  let isRunning = false;
  const calculateDelay = () => {
    if (!backoff || consecutiveErrors === 0) {
      return interval;
    }
    const multiplier = Math.min(2 ** consecutiveErrors, 10);
    return interval * multiplier;
  };
  const stop = () => {
    if (stopped)
      return;
    stopped = true;
    if (timeoutId !== void 0) {
      clearTimeout(timeoutId);
      timeoutId = void 0;
    }
  };
  const loop = async () => {
    if (stopped)
      return;
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
      if (maxRetries > 0 && consecutiveErrors >= maxRetries) {
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

// src/data/model.ts
var Model = class {
  constructor(initial) {
    this.emitter = new Emitter();
    this.destroyed = false;
    this.initial = { ...initial };
    this.data = { ...initial };
  }
  get(key) {
    this.checkDestroyed();
    return this.data[key];
  }
  getAll() {
    this.checkDestroyed();
    return { ...this.data };
  }
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
    if (!hasChanges) {
      return false;
    }
    Object.assign(this.data, changes);
    this.emitter.emit("change", changes);
    return true;
  }
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
  has(key, value) {
    this.checkDestroyed();
    return this.data[key] === value;
  }
  onChange(fn, scope) {
    this.checkDestroyed();
    return this.emitter.on("change", fn, scope);
  }
  async fetch(url, options) {
    this.checkDestroyed();
    const patch = await fetchJson(url, options);
    this.set(patch);
    return this.getAll();
  }
  autoRefresh(url, options) {
    this.checkDestroyed();
    return startSequentialRefresh(
      () => this.fetch(url, {
        ...options.fetch,
        scope: options.scope
      }),
      options
    );
  }
  destroy() {
    if (this.destroyed)
      return;
    this.destroyed = true;
    this.emitter.clear();
  }
  isDestroyed() {
    return this.destroyed;
  }
  checkDestroyed() {
    if (this.destroyed) {
      throw new Error("[Model] Cannot use destroyed model");
    }
  }
};

// src/data/collection.ts
var Collection = class {
  constructor() {
    this.items = [];
    this.emitter = new Emitter();
    this.destroyed = false;
  }
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
  add(...items) {
    this.checkDestroyed();
    this.items.push(...items);
    this.emitter.emit("add", items);
  }
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
    if (index < 0 || index >= this.items.length) {
      return void 0;
    }
    const [item] = this.items.splice(index, 1);
    this.emitter.emit("remove", [item]);
    return item;
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
  sort(compareFn) {
    this.checkDestroyed();
    this.items.sort(compareFn);
    this.emitter.emit("sort");
  }
  reset(items) {
    this.checkDestroyed();
    this.items = [...items];
    this.emitter.emit("reset", this.items);
  }
  clear() {
    this.checkDestroyed();
    if (this.items.length > 0) {
      this.items = [];
      this.emitter.emit("reset", []);
    }
  }
  async fetch(url, options) {
    this.checkDestroyed();
    const items = await fetchJson(url, options);
    this.reset(items);
    return this.getAll();
  }
  onAdd(fn, scope) {
    this.checkDestroyed();
    return this.emitter.on("add", fn, scope);
  }
  onRemove(fn, scope) {
    this.checkDestroyed();
    return this.emitter.on("remove", fn, scope);
  }
  onReset(fn, scope) {
    this.checkDestroyed();
    return this.emitter.on("reset", fn, scope);
  }
  onSort(fn, scope) {
    this.checkDestroyed();
    return this.emitter.on("sort", fn, scope);
  }
  onChange(fn, scope) {
    this.checkDestroyed();
    const c1 = this.onAdd(fn, scope);
    const c2 = this.onRemove(fn, scope);
    const c3 = this.onReset(fn, scope);
    const c4 = this.onSort(fn, scope);
    return () => {
      c1();
      c2();
      c3();
      c4();
    };
  }
  autoRefresh(url, opts) {
    this.checkDestroyed();
    return startSequentialRefresh(
      () => this.fetch(url, {
        ...opts.fetch,
        scope: opts.scope
      }),
      opts
    );
  }
  destroy() {
    if (this.destroyed)
      return;
    this.destroyed = true;
    this.items = [];
    this.emitter.clear();
  }
  isDestroyed() {
    return this.destroyed;
  }
  checkDestroyed() {
    if (this.destroyed) {
      throw new Error(
        "[Collection] Cannot use destroyed collection"
      );
    }
  }
};

// src/dom/elements.ts
var Elements = class _Elements {
  constructor(nodes) {
    this.nodes = nodes;
  }
  get length() {
    return this.nodes.length;
  }
  each(fn) {
    this.nodes.forEach(fn);
    return this;
  }
  get(index = 0) {
    var _a;
    return (_a = this.nodes[index]) != null ? _a : null;
  }
  first() {
    var _a;
    return (_a = this.nodes[0]) != null ? _a : null;
  }
  last() {
    var _a;
    return (_a = this.nodes[this.nodes.length - 1]) != null ? _a : null;
  }
  find(selector) {
    const out = [];
    this.each((el2) => {
      out.push(...Array.from(el2.querySelectorAll(selector)));
    });
    return new _Elements(out);
  }
  filter(predicate) {
    if (typeof predicate === "string") {
      return new _Elements(
        this.nodes.filter((el2) => el2.matches(predicate))
      );
    }
    return new _Elements(this.nodes.filter(predicate));
  }
  parent() {
    const parents = [];
    this.each((el2) => {
      if (el2.parentElement) {
        parents.push(el2.parentElement);
      }
    });
    return new _Elements(parents);
  }
  closest(selector) {
    const matches = [];
    this.each((el2) => {
      const match = el2.closest(selector);
      if (match) {
        matches.push(match);
      }
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
    if (value === void 0) {
      return (_b = (_a = this.get()) == null ? void 0 : _a.textContent) != null ? _b : "";
    }
    return this.each((el2) => {
      el2.textContent = value;
    });
  }
  html(value) {
    var _a, _b;
    if (value === void 0) {
      return (_b = (_a = this.get()) == null ? void 0 : _a.innerHTML) != null ? _b : "";
    }
    return this.each((el2) => {
      el2.innerHTML = value;
    });
  }
  attr(name, value) {
    var _a, _b;
    if (value === void 0) {
      return (_b = (_a = this.get()) == null ? void 0 : _a.getAttribute(name)) != null ? _b : "";
    }
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
      return el2 instanceof HTMLElement ? (_a = el2.dataset[key]) != null ? _a : "" : "";
    }
    return this.each((el2) => {
      if (el2 instanceof HTMLElement) {
        el2.dataset[key] = value;
      }
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
  on(event, handler, scope) {
    return this.each((el2) => {
      el2.addEventListener(event, handler);
      scope == null ? void 0 : scope.onDispose(() => {
        el2.removeEventListener(event, handler);
      });
    });
  }
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
  trigger(event, detail) {
    return this.each((el2) => {
      el2.dispatchEvent(
        new CustomEvent(event, { detail })
      );
    });
  }
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
    return this.nodes.some(
      (el2) => el2.classList.contains(className)
    );
  }
  css(property, value) {
    if (typeof property === "string" && value === void 0) {
      const el2 = this.get();
      return el2 instanceof HTMLElement ? getComputedStyle(el2).getPropertyValue(property) : "";
    }
    if (typeof property === "string") {
      return this.each((el2) => {
        if (el2 instanceof HTMLElement) {
          el2.style.setProperty(property, value);
        }
      });
    }
    return this.each((el2) => {
      if (el2 instanceof HTMLElement) {
        Object.entries(property).forEach(
          ([key, val]) => {
            el2.style.setProperty(key, val);
          }
        );
      }
    });
  }
  show() {
    return this.each((el2) => {
      if (el2 instanceof HTMLElement) {
        el2.style.display = "";
      }
    });
  }
  hide() {
    return this.each((el2) => {
      if (el2 instanceof HTMLElement) {
        el2.style.display = "none";
      }
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
  isVisible() {
    return this.nodes.some((el2) => {
      if (el2 instanceof HTMLElement) {
        return el2.style.display !== "none" && el2.offsetParent !== null;
      }
      return false;
    });
  }
  append(content) {
    return this.each((el2) => {
      if (typeof content === "string") {
        el2.insertAdjacentHTML("beforeend", content);
      } else if (content instanceof _Elements) {
        content.each(
          (child) => el2.appendChild(child.cloneNode(true))
        );
      } else {
        el2.appendChild(content);
      }
    });
  }
  prepend(content) {
    return this.each((el2) => {
      if (typeof content === "string") {
        el2.insertAdjacentHTML("afterbegin", content);
      } else if (content instanceof _Elements) {
        const first = el2.firstChild;
        content.each((child) => {
          el2.insertBefore(
            child.cloneNode(true),
            first
          );
        });
      } else {
        el2.insertBefore(content, el2.firstChild);
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
      this.nodes.map(
        (el2) => el2.cloneNode(deep)
      )
    );
  }
  focus() {
    const el2 = this.get();
    if (el2 instanceof HTMLElement) {
      el2.focus();
    }
    return this;
  }
  blur() {
    const el2 = this.get();
    if (el2 instanceof HTMLElement) {
      el2.blur();
    }
    return this;
  }
};

// src/dom/el.ts
function el(input, root) {
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
      console.error(
        `[el] Invalid selector: "${selector}"`,
        error
      );
      return new Elements([]);
    }
  }
  if (input instanceof Element) {
    return new Elements([input]);
  }
  if (input instanceof NodeList) {
    return new Elements(
      Array.from(input)
    );
  }
  if (input instanceof HTMLCollection) {
    return new Elements(Array.from(input));
  }
  if (Array.isArray(input)) {
    const elements = input.filter(
      (item) => item instanceof Element
    );
    if (elements.length !== input.length) {
      console.warn(
        "[el] Some items in array were not Elements and were filtered out"
      );
    }
    return new Elements(elements);
  }
  console.warn(
    "[el] Unrecognized input type:",
    typeof input
  );
  return new Elements([]);
}

// src/view/view.ts
var View = class {
  constructor(root, model, options = {}) {
    this.root = root;
    this.model = model;
    this.destroyed = false;
    this.children = /* @__PURE__ */ new Set();
    this.options = {
      autoDestroy: true,
      ...options
    };
    this.scope = options.parentScope ? options.parentScope.createChild() : createScope();
    if (this.options.autoDestroy) {
      this.setupAutoDestroy();
    }
    this.init();
  }
  init() {
  }
  $(selector) {
    return el(selector, this.root);
  }
  $root() {
    return el(this.root);
  }
  createChild(ViewClass, root, model) {
    this.checkDestroyed();
    const child = new ViewClass(root, model, {
      parentScope: this.scope,
      autoDestroy: false
    });
    this.children.add(child);
    child.scope.onDispose(() => {
      this.children.delete(child);
    });
    return child;
  }
  createChildren(ViewClass, selector, modelFn) {
    this.checkDestroyed();
    const views = [];
    this.$(selector).each((element, index) => {
      const model = modelFn ? modelFn(element, index) : void 0;
      views.push(this.createChild(ViewClass, element, model));
    });
    return views;
  }
  emit(event, detail) {
    this.checkDestroyed();
    this.$root().trigger(event, detail);
  }
  on(event, handler) {
    this.checkDestroyed();
    this.$root().on(event, handler, this.scope);
  }
  show() {
    this.checkDestroyed();
    this.$root().show();
  }
  hide() {
    this.checkDestroyed();
    this.$root().hide();
  }
  toggle(force) {
    this.checkDestroyed();
    this.$root().toggle(force);
  }
  isVisible() {
    return this.$root().isVisible();
  }
  isDestroyed() {
    return this.destroyed;
  }
  getRoot() {
    return this.root;
  }
  getModel() {
    return this.model;
  }
  destroy() {
    if (this.destroyed)
      return;
    this.destroyed = true;
    for (const child of this.children) {
      try {
        child.destroy();
      } catch (error) {
        console.error(
          "[View] Error destroying child view:",
          error
        );
      }
    }
    this.children.clear();
    try {
      this.scope.dispose();
    } catch (error) {
      console.error(
        "[View] Error disposing scope:",
        error
      );
    }
    if (this.model && typeof this.model.destroy === "function") {
      try {
        this.model.destroy();
      } catch (error) {
        console.error(
          "[View] Error destroying model:",
          error
        );
      }
    }
  }
  setupAutoDestroy() {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const removed of Array.from(
          mutation.removedNodes
        )) {
          if (removed === this.root || removed instanceof Element && removed.contains(this.root)) {
            this.destroy();
            observer.disconnect();
            return;
          }
        }
      }
    });
    if (this.root.parentElement) {
      observer.observe(this.root.parentElement, {
        childList: true,
        subtree: true
      });
    }
    this.scope.onDispose(() => {
      observer.disconnect();
    });
  }
  checkDestroyed() {
    if (this.destroyed) {
      throw new Error(
        "[View] Cannot use destroyed view"
      );
    }
  }
};
export {
  Collection,
  Elements,
  Model,
  View,
  createScope,
  el,
  fetchJson
};
