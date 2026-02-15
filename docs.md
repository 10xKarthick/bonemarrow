# BoneMarrow

BoneMarrow is a lightweight, lifecycle-aware JavaScript/TypeScript library for structuring UI logic on top of server-rendered HTML — without jQuery, virtual DOMs, or heavyweight frameworks.

It provides small, explicit primitives for managing:

* Lifetime
* Async behavior
* State
* DOM interaction
* UI ownership

No hidden rendering.
No global state.
No magic.

---

# Philosophy

BoneMarrow is built on strict principles:

* Explicit ownership over implicit behavior
* Lifecycle-aware code by default
* No hidden async work
* No global mutable state
* Predictable teardown
* Debuggable abstractions

If something happens, you should be able to answer:

**Who owns it? How long does it live? How does it stop?**

---

# Installation

### npm

```bash
npm install bonemarrow
```

### CDN

```html
<script src="https://unpkg.com/bonemarrow"></script>
```

Global namespace:

```js
bone.createScope()
bone.Model
bone.Collection
bone.View
```

---

# Core Exports

```ts
import {
  createScope,
  fetchJson,
  Model,
  Collection,
  View,
  el,
  Elements
} from "bonemarrow";
```

---

# Scope

A `Scope` represents ownership and lifetime.

Anything attached to a scope is cleaned up when disposed.

## Creating a Scope

```ts
const scope = createScope();
```

Scopes are lightweight.

---

## Scope Interface

```ts
interface Scope {
  signal: AbortSignal;
  onDispose(fn: () => void): void;
  createChild(): Scope;
  dispose(): void;
}
```

---

## Behavior

Disposing a scope:

* Aborts fetches tied to it
* Runs cleanup callbacks
* Disposes child scopes
* Clears in-flight dedupe maps

Calling `dispose()` multiple times is safe.

---

# Fetch API

Lifecycle-aware fetch helper.

```ts
fetchJson<T>(url: string, options?: FetchOptions<T>): Promise<T>
```

## Options

```ts
interface FetchOptions<T> {
  scope?: Scope
  abort?: boolean
  timeout?: number
  retryOnFailure?: number
  retryDelay?: number
  dedupe?: boolean
  init?: RequestInit
  parse?: (json: unknown) => T
}
```

---

## Features

### Scoped Abort

```ts
fetchJson("/api/data", {
  scope,
  abort: true
});
```

### Timeout

```ts
fetchJson("/api/data", { timeout: 3000 });
```

### Retry

```ts
fetchJson("/api/data", {
  retryOnFailure: 2,
  retryDelay: 200
});
```

### Scope-Local Deduplication

```ts
fetchJson("/api/data", {
  scope,
  dedupe: true
});
```

Only one in-flight request per scope.

No caching.

---

# Sequential Refresh

Used internally by `Model.autoRefresh` and `Collection.autoRefresh`.

Behavior:

```
fetch → complete → wait → fetch → complete
```

Never overlaps.

Supports:

* Immediate start
* Retry limits
* Exponential backoff

---

# Model

Observable state container.

## Create

```ts
const user = new Model({
  id: 0,
  name: ""
});
```

---

## API

### get

```ts
user.get("name");
```

### getAll

```ts
user.getAll();
```

### set

```ts
user.set({ name: "Raj" });
```

Emits change only if values actually changed.

### onChange

```ts
user.onChange(patch => {
  console.log(patch);
}, scope);
```

### reset

Resets to initial state.

### has

```ts
user.has("role", "admin");
```

### fetch

```ts
await user.fetch("/api/user/42", {
  scope,
  abort: true
});
```

### autoRefresh

```ts
user.autoRefresh("/api/user/42", {
  scope,
  interval: 5000,
  fetch: { abort: true }
});
```

### destroy

```ts
user.destroy();
```

After destruction, usage throws.

---

# Collection

List container with reset semantics.

## Create

```ts
const users = new Collection<User>();
```

---

## Core Methods

```ts
collection.getAll()
collection.length
collection.at(index)
collection.add(...)
collection.remove(predicate)
collection.removeAt(index)
collection.reset(items)
collection.clear()
collection.sort(compareFn)
```

---

## Query Helpers

```ts
collection.find(...)
collection.findIndex(...)
collection.filter(...)
collection.map(...)
collection.forEach(...)
collection.some(...)
collection.every(...)
```

---

## Events

```ts
collection.onAdd(fn, scope)
collection.onRemove(fn, scope)
collection.onReset(fn, scope)
collection.onSort(fn, scope)
collection.onChange(fn, scope)
```

---

## Fetch

```ts
await collection.fetch("/api/users", { scope });
```

---

## autoRefresh

```ts
collection.autoRefresh("/api/users", {
  scope,
  interval: 60000
});
```

---

# DOM Utilities

## el()

```ts
el(".btn")
el(element)
el(nodeList)
el(arrayOfElements)
el(".row", container)
```

Returns `Elements`.

---

# Elements API

Chainable DOM wrapper.

## Traversal

```ts
.find(selector)
.filter(selector | fn)
.parent()
.closest(selector)
.children()
.first()
.last()
.get(index)
```

---

## Content

```ts
.text()
.text("value")

.html()
.html("value")

.val()
.val("value")
```

---

## Attributes

```ts
.attr(name)
.attr(name, value)

.removeAttr(name)

.data(key)
.data(key, value)
```

---

## Events

Scoped:

```ts
.on(event, handler, scope)
```

One-time:

```ts
.once(event, handler)
```

Remove:

```ts
.off(event, handler)
```

Dispatch:

```ts
.trigger(event, detail)
```

---

## Classes

```ts
.addClass("active")
.removeClass("active")
.toggleClass("active")
.hasClass("active")
```

---

## CSS

```ts
.css("color")
.css("color", "red")

.css({
  color: "red",
  display: "none"
})
```

---

## Visibility

```ts
.show()
.hide()
.toggle()
.isVisible()
```

---

## DOM Manipulation

```ts
.append(content)
.prepend(content)
.remove()
.empty()
.clone(deep?)
```

---

## Focus

```ts
.focus()
.blur()
```

---

# View

Represents a UI ownership boundary.

Owns:

* DOM root
* Scope
* Child views
* Optional model

---

## Create View

```ts
class UserView extends View<Model<User>> {
  protected init() {
    this.$(".btn").on(
      "click",
      () => this.model.set({ name: "Raj" }),
      this.scope
    );
  }
}
```

---

## Instantiate

```ts
const view = new UserView(
  document.getElementById("app")!,
  user
);
```

---

## Scoped Selector

```ts
this.$(".row")
```

Equivalent to:

```ts
el(".row", this.root)
```

---

## Child Views

```ts
this.createChild(ViewClass, root, model);
this.createChildren(ViewClass, ".row", el => model);
```

Children are disposed automatically.

---

## Lifecycle

```ts
view.destroy();
```

Destroy:

* Child views
* Scope
* Event listeners
* Fetches
* Polling
* Optional model

Safe to call multiple times.

---

## Auto Destroy

If `autoDestroy: true` (default):

View destroys automatically when removed from DOM.

---

# Progressive Enhancement

* Server renders full HTML
* BoneMarrow enhances behavior
* Without JS → page still works

---

# Best Practices

* Always tie async work to a scope
* Use `abort: true` for UI-driven fetches
* Dispose views explicitly
* Keep models small and focused
* Avoid global state
* Prefer sequential polling over intervals

---

# FAQ

**Is BoneMarrow a framework?**
No. It provides primitives, not structure.

**Can it replace jQuery?**
Yes, incrementally.

**Does it replace React or Vue?**
No. It solves lifecycle and ownership in server-rendered apps.
