define("core/scope", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.createScope = createScope;
    function createScopeInternal(parent) {
        const controller = new AbortController();
        const cleanups = [];
        const children = new Set;
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
                if (disposed)
                    return;
                disposed = true;
                for (const child of children)
                    child.dispose();
                children.clear();
                controller.abort();
                for (const fn of cleanups)
                    fn();
                cleanups.length = 0;
            }
        };
        parent === null || parent === void 0 ? void 0 : parent.onDispose(() => scope.dispose());
        return scope;
    }
    let windowScope = null;
    function getWindowScope() {
        if (windowScope)
            return windowScope;
        windowScope = createScopeInternal(null);
        const disposeAll = () => windowScope === null || windowScope === void 0 ? void 0 : windowScope.dispose();
        window.addEventListener("pagehide", disposeAll);
        window.addEventListener("beforeunload", disposeAll);
        return windowScope;
    }
    function createScope() {
        return getWindowScope().createChild();
    }
});
define("core/fetch", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.fetchJson = fetchJson;
    function requestKey(url, init) {
        var _a;
        return `${(_a = init === null || init === void 0 ? void 0 : init.method) !== null && _a !== void 0 ? _a : "GET"}:${url}`;
    }
    async function fetchJson(url, options = {}) {
        var _a;
        const { scope, abort = false, timeout, retryOnFailure = 0, retryDelay = 0, dedupe = false, init, parse } = options;
        const internalScope = scope;
        let inFlight;
        let key;
        if (dedupe && internalScope) {
            inFlight = (_a = internalScope._inFlight) !== null && _a !== void 0 ? _a : (internalScope._inFlight = new Map());
            key = requestKey(url, init);
            const existing = inFlight === null || inFlight === void 0 ? void 0 : inFlight.get(key);
            if (existing) {
                return existing;
            }
        }
        const promise = (async () => {
            let attempt = 0;
            while (true) {
                const controller = new AbortController();
                if (abort && scope) {
                    scope.signal.addEventListener('abort', () => controller.abort(), { once: true });
                }
                let timeoutId;
                if (typeof timeout === 'number') {
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
                }
                catch (err) {
                    attempt++;
                    if (err instanceof DOMException && err.name === 'AbortError')
                        throw err;
                    if (attempt > retryOnFailure)
                        throw err;
                    if (retryDelay > 0) {
                        await new Promise(resolve => setTimeout(resolve, timeoutId));
                    }
                }
                finally {
                    if (timeoutId)
                        clearTimeout(timeoutId);
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
});
define("core/emitter", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Emitter = void 0;
    class Emitter {
        constructor() {
            this.events = new Map();
        }
        on(event, fn) {
            let set = this.events.get(event);
            if (!set) {
                set = new Set();
                this.events.set(event, set);
            }
            set.add(fn);
            return () => set.delete(fn);
        }
        emit(event, ...args) {
            var _a;
            (_a = this.events.get(event)) === null || _a === void 0 ? void 0 : _a.forEach((fn) => fn(...args));
        }
        clear() {
            this.events.clear();
        }
    }
    exports.Emitter = Emitter;
});
define("refresh/sequentialRefresh", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.startSequentialRefresh = startSequentialRefresh;
    function startSequentialRefresh(fn, opts) {
        const { interval, scope, immediate = true } = opts;
        let stopped = false;
        let timeoutId;
        const loop = async () => {
            if (stopped)
                return;
            try {
                await fn();
            }
            catch { }
            if (stopped)
                return;
            timeoutId = window.setTimeout(loop, interval);
        };
        immediate ? loop() : (timeoutId = window.setTimeout(loop, interval));
        const stop = () => {
            stopped = true;
            if (timeoutId)
                clearTimeout(timeoutId);
        };
        scope.onDispose(stop);
        return stop;
    }
});
define("data/model", ["require", "exports", "core/emitter", "core/fetch", "refresh/sequentialRefresh"], function (require, exports, emitter_1, fetch_1, sequentialRefresh_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Model = void 0;
    class Model {
        constructor(initial) {
            this.emitter = new emitter_1.Emitter();
            this.data = { ...initial };
        }
        get(key) {
            return this.data[key];
        }
        set(patch) {
            Object.assign(this.data, patch);
            this.emitter.emit('change', patch);
        }
        onChange(fn) {
            return this.emitter.on('change', fn);
        }
        async fetch(url, options) {
            const patch = await (0, fetch_1.fetchJson)(url, options);
            this.set(patch);
            return this.data;
        }
        autoRefresh(url, options) {
            return (0, sequentialRefresh_1.startSequentialRefresh)(() => this.fetch(url, { ...options.fetch, scope: options.scope }), options);
        }
        destroy() {
            this.emitter.clear();
        }
    }
    exports.Model = Model;
});
define("data/collection", ["require", "exports", "core/emitter", "core/fetch", "refresh/sequentialRefresh"], function (require, exports, emitter_2, fetch_2, sequentialRefresh_2) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Collection = void 0;
    class Collection {
        constructor() {
            this.items = [];
            this.emitter = new emitter_2.Emitter();
        }
        async fetch(url, options) {
            const items = await (0, fetch_2.fetchJson)(url, options);
            this.items = items;
            this.emitter.emit('reset', items);
            return items;
        }
        onReset(fn) {
            return this.emitter.on("reset", fn);
        }
        autoRefresh(url, opts) {
            return (0, sequentialRefresh_2.startSequentialRefresh)(() => this.fetch(url, { ...opts.fetch, scope: opts.scope }), opts);
        }
        destroy() {
            this.items.length = 0;
            this.emitter.clear();
        }
    }
    exports.Collection = Collection;
});
define("dom/elements", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Elements = void 0;
    class Elements {
        constructor(nodes) {
            this.nodes = nodes;
        }
        each(fn) {
            this.nodes.forEach(fn);
            return this;
        }
        get(index = 0) {
            var _a;
            return (_a = this.nodes[index]) !== null && _a !== void 0 ? _a : null;
        }
        find(selector) {
            const out = [];
            this.each((el) => {
                out.push(...Array.from(el.querySelectorAll(selector)));
            });
            return new Elements(out);
        }
        on(event, handler, scope) {
            return this.each((el) => {
                el.addEventListener(event, handler);
                scope === null || scope === void 0 ? void 0 : scope.onDispose(() => el.removeEventListener(event, handler));
            });
        }
        text(value) {
            var _a, _b;
            if (value === undefined) {
                return (_b = (_a = this.get()) === null || _a === void 0 ? void 0 : _a.textContent) !== null && _b !== void 0 ? _b : "";
            }
            return this.each((el) => (el.textContent = value));
        }
        addClass(cls) {
            return this.each((el) => el.classList.add(cls));
        }
        removeClass(cls) {
            return this.each((el) => el.classList.remove(cls));
        }
    }
    exports.Elements = Elements;
});
define("dom/el", ["require", "exports", "dom/elements"], function (require, exports, elements_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.el = el;
    function el(input, root) {
        if (typeof input === "string") {
            return new elements_1.Elements(Array.from((root !== null && root !== void 0 ? root : document).querySelectorAll(input)));
        }
        if (input instanceof Element) {
            return new elements_1.Elements([input]);
        }
        if (input instanceof NodeList) {
            return new elements_1.Elements(Array.from(input));
        }
        return new elements_1.Elements(input);
    }
});
define("view/view", ["require", "exports", "core/scope", "dom/el"], function (require, exports, scope_1, el_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.View = void 0;
    class View {
        constructor(root, model) {
            this.root = root;
            this.model = model;
            this.scope = (0, scope_1.createScope)();
            this.init();
        }
        init() { }
        $(selector) {
            return (0, el_1.el)(selector, this.root);
        }
        destroy() {
            var _a, _b;
            this.scope.dispose();
            (_b = (_a = this.model) === null || _a === void 0 ? void 0 : _a.destroy) === null || _b === void 0 ? void 0 : _b.call(_a);
        }
    }
    exports.View = View;
});
define("index", ["require", "exports", "core/scope", "core/fetch", "data/model", "data/collection", "view/view", "dom/elements", "dom/el"], function (require, exports, scope_2, fetch_3, model_1, collection_1, view_1, elements_2, el_2) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.el = exports.Elements = exports.View = exports.Collection = exports.Model = exports.fetchJson = exports.createScope = void 0;
    Object.defineProperty(exports, "createScope", { enumerable: true, get: function () { return scope_2.createScope; } });
    Object.defineProperty(exports, "fetchJson", { enumerable: true, get: function () { return fetch_3.fetchJson; } });
    Object.defineProperty(exports, "Model", { enumerable: true, get: function () { return model_1.Model; } });
    Object.defineProperty(exports, "Collection", { enumerable: true, get: function () { return collection_1.Collection; } });
    Object.defineProperty(exports, "View", { enumerable: true, get: function () { return view_1.View; } });
    Object.defineProperty(exports, "Elements", { enumerable: true, get: function () { return elements_2.Elements; } });
    Object.defineProperty(exports, "el", { enumerable: true, get: function () { return el_2.el; } });
});
//# sourceMappingURL=bonemarrow.js.map