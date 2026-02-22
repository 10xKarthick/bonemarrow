# BoneMarrow Documentation

BoneMarrow is a lifecycle-first UI primitive library.

Everything flows through **Scope**.

If you understand Scope, you understand BoneMarrow.

---

# Architecture Overview

BoneMarrow consists of:

- Scope (lifecycle + cancellation root)
- TypedEmitter (event primitive)
- fetchJson (scope-aware network layer)
- createRefresh (sequential polling primitive)
- Model (reactive object state)
- Collection (reactive array state)
- Elements / el (DOM wrapper)
- View (UI composition primitive)

There is no global state.
There is no hidden scheduler.
There is no implicit magic.

---

# 1. Scope

Scope is the root lifecycle primitive.

Responsibilities:

- Abort async work via AbortSignal
- Own cleanup callbacks (LIFO)
- Form a tree (parent → child)
- Dispose depth-first

## Creating scopes

```ts
import { createScope, createRootScope } from "bonemarrow";
```

### Browser (attached to window lifecycle)

```ts
const scope = createScope();
```

Automatically disposed on pagehide / beforeunload.

### Standalone (tests, Node, workers)

```ts
const scope = createRootScope();
```

You must manually call:

```ts
scope.dispose();
```

## Disposal order

1. Children disposed
2. AbortSignal aborted
3. Cleanups run (LIFO)

---

# 2. TypedEmitter

Type-safe event emitter.

```ts
type Events = {
  change: [data: string];
};

const emitter = new TypedEmitter<Events>();
```

## Methods

- on(event, handler, scope?)
- once(event, handler, scope?)
- onceAsync(event, scope?)
- emit(event, ...args)
- emitAsync(event, ...args)
- off(event)
- clear()

### emit vs emitAsync

emit → isolates errors  
emitAsync → awaits all handlers and throws AggregateError

Use emitAsync for lifecycle hooks.

---

# 3. fetchJson

Scope-aware fetch wrapper.

```ts
fetchJson<T>(url, options)
```

## Features

- Scope cancellation
- Timeout (per attempt)
- Retry with delay
- Dedup per scope
- Custom JSON transform

Example:

```ts
const data = await fetchJson<User[]>("/api/users", {
  scope,
  timeout: 5000,
  retryOnFailure: 2,
  retryDelay: 500,
  dedupe: true
});
```

Aborts automatically if scope is disposed.

---

# 4. createRefresh

Sequential, non-overlapping polling loop.

```ts
const refresh = createRefresh(
  async (signal) => {
    const res = await fetch("/api/data", { signal });
    update(await res.json());
  },
  {
    interval: 5000,
    scope
  }
);
```

## Guarantees

- No overlapping executions
- Fresh AbortController per tick
- Optional exponential backoff
- Optional maxRetries
- pause / resume / stop

---

# 5. Model

Reactive object container.

```ts
const model = new Model({ name: "John" }, scope);
```

## Methods

### Read

- get(key)
- getAll()
- isDirty()
- has(key, value)

### Write

- set(patch)
- reset()

Only changed keys emit.

### Observe

- onChange(fn, scope?)
- watch(key, fn, scope?)

### Network

- fetch(url)
- autoRefresh(url, options)

Model owns a scope.
Destroying scope destroys model.

---

# 6. Collection

Reactive array container.

```ts
const users = new Collection<User>([], scope);
```

## Read

- getAll()
- at(index)
- find()
- filter()
- map()
- length

## Write

- add()
- remove(predicate)
- removeAt()
- update(predicate, patch)
- move()
- sort()
- reset()
- clear()

## Observe

- onAdd
- onRemove
- onUpdate
- onReset
- onSort

## Network

- fetch(url)
- autoRefresh(url, options)

---

# 7. DOM Utilities

## el()

Selector + wrapper.

```ts
el(".card")
el(element)
el(nodeList)
```

## Elements

Fluent DOM wrapper.

Features:

- find / filter / not / closest
- text / html
- attr / data / val
- on / once / off / trigger
- addClass / removeClass / toggleClass
- css / show / hide / toggle
- append / prepend / remove

All methods safe on empty collections.

Scope-aware event cleanup supported.

---

# 8. View

UI composition primitive.

```ts
class UserView extends View<User> {
  protected init() {
    this.$(".name").text(this.model?.get("name") ?? "");

    this.model?.onChange(() => this.render(), this.scope);
  }

  protected render() {
    this.$(".name").text(this.model?.get("name") ?? "");
  }
}
```

## Lifecycle

1. constructor
2. init()
3. render() (manual)
4. destroy()

## Child Views

```ts
this.createChild(ChildView, element, model);
```

Child views are scope-owned automatically.

## Auto-destroy

Uses MutationObserver to destroy when root is removed.

Disable:

```ts
new View(root, model, { autoDestroy: false });
```

---

# Design Guarantees

- No overlapping async refresh
- No fetch leaks
- Deterministic disposal
- LIFO cleanup
- No hidden timers
- No background schedulers
- No implicit global state

---

# Recommended Patterns

✔ One child scope per Model  
✔ One View per DOM root  
✔ Pass scope explicitly to async work  
✔ Use autoRefresh for polling  
✔ Use watch() for granular updates

---

# Anti-Patterns

✘ Sharing one scope across unrelated models  
✘ Forgetting to dispose root scopes in tests  
✘ Using html() with unsanitized user input  
✘ Relying on implicit re-renders

---

# Philosophy

BoneMarrow favors:

- Explicit ownership
- Deterministic cleanup
- Predictable async
- Small composable primitives

It is not reactive magic.
It is not a framework.

It is a disciplined layer over the DOM.
