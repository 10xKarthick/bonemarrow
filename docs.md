# BoneMarrow Documentation

BoneMarrow is a lightweight, lifecycle-aware JavaScript/TypeScript library for structuring UI logic on top of server-rendered HTML—without jQuery, virtual DOMs, or heavyweight frameworks.

BoneMarrow provides **small, explicit primitives** for managing lifecycle, async behavior, state, and DOM interactions in a predictable way.

---

## Philosophy

BoneMarrow is built on a few strict ideas:

* Explicit ownership over implicit behavior
* Lifecycle-aware code by default
* No hidden async work
* No global state
* No magic rendering
* Boring, debuggable abstractions

If something happens, you should be able to answer:
**who owns it, how long it lives, and how it stops**.

---

## Core Concepts

### Scope

A `Scope` represents **lifetime and ownership**.

Anything attached to a scope:

* event listeners
* timers
* network requests
* child scopes

…is automatically cleaned up when the scope is disposed.

---

### Model

A `Model` represents a **single observable state object**.

---

### Collection

A `Collection` represents a **list of items** with reset semantics.

---

### View

A `View` owns:

* a DOM root
* a scope
* UI behavior

Views define **clear UI ownership boundaries**.

---

## Scope API

### createScope

Creates a new scope attached to the window-level root scope.

```ts
const scope = createScope();
```

Scopes are lightweight and safe to create freely.

---

### Scope Interface

```ts
interface Scope {
  signal: AbortSignal;
  onDispose(fn: () => void): void;
  createChild(): Scope;
  dispose(): void;
}
```

---

### signal

An `AbortSignal` tied to the scope’s lifetime.

Used internally for fetch cancellation and available for advanced integrations.

```ts
const scope = createScope();

fetch(url, { signal: scope.signal });
```

---

### onDispose

Registers a cleanup callback.

```ts
const scope = createScope();

scope.onDispose(() => {
  console.log("scope disposed");
});
```

Behavior:

* Called exactly once
* Called immediately if already disposed

---

### createChild

Creates a child scope.

```ts
const parent = createScope();
const child = parent.createChild();
```

When `parent` is disposed, `child` is disposed automatically.

---

### dispose

Disposes the scope.

```ts
scope.dispose();
```

Disposing a scope:

* aborts scoped fetches
* runs cleanup callbacks
* disposes child scopes

Calling `dispose()` multiple times is safe.

---

## Fetch API

### fetchJson

Unified, lifecycle-aware fetch helper.

```ts
fetchJson<T>(url, options?): Promise<T>
```

---

### Basic Example

```ts
const data = await fetchJson("/api/user/1");
```

---

### Fetch Options

```ts
interface FetchOptions<T> {
  scope?: Scope;
  abort?: boolean;
  timeout?: number;
  retryOnFailure?: number;
  retryDelay?: number;
  dedupe?: boolean;
  init?: RequestInit;
  parse?: (json: unknown) => T;
}
```

---

### Abort with Scope

```ts
const scope = createScope();

fetchJson("/api/data", {
  scope,
  abort: true
});
```

The request is aborted automatically when the scope is disposed.

---

### Timeout

```ts
fetchJson("/api/data", {
  timeout: 3000
});
```

Aborts the request after 3 seconds.

---

### Retry on Failure

```ts
fetchJson("/api/data", {
  retryOnFailure: 2,
  retryDelay: 200
});
```

Retries on network or HTTP failure.

---

### Request De-duplication (Scope-local)

```ts
fetchJson("/api/data", {
  scope,
  dedupe: true
});
```

Only one in-flight request per scope is allowed.
No caching is performed.

---

### Custom Parsing

```ts
fetchJson("/api/user", {
  parse: json => ({
    id: json["id"],
    name: json["full_name"]
  })
});
```

---

## Model API

### Creating a Model

```ts
const user = new Model({
  id: 0,
  name: ""
});
```

---

### get

```ts
user.get("name");
```

Returns the current value.

---

### set

```ts
user.set({ name: "Raj" });
```

Merges a partial patch and emits a change event.

---

### onChange

```ts
user.onChange(patch => {
  if (patch.name) {
    console.log("Name changed:", patch.name);
  }
});
```

Listeners receive only the changed fields.

---

### fetch

```ts
await user.fetch("/api/user/42", {
  abort: true,
  scope
});
```

Fetched data is merged into the model.

---

### autoRefresh (Sequential Polling)

```ts
user.autoRefresh("/api/user/42", {
  scope,
  interval: 5000,
  fetch: { abort: true }
});
```

Behavior:

```
fetch → complete → wait 5s → fetch → complete → wait 5s
```

No overlapping requests.

---

### destroy

```ts
user.destroy();
```

Clears internal listeners.

---

## Collection API

### Creating a Collection

```ts
const users = new Collection<User>();
```

---

### fetch

```ts
await users.fetch("/api/users", {
  scope,
  dedupe: true
});
```

Replaces the entire collection.

---

### onReset

```ts
users.onReset(items => {
  console.log("New items:", items);
});
```

Called whenever the collection is replaced.

---

### autoRefresh

```ts
users.autoRefresh("/api/users", {
  scope,
  interval: 60000
});
```

Sequential polling identical to `Model.autoRefresh`.

---

### destroy

```ts
users.destroy();
```

Clears items and listeners.

---

## DOM Utilities

### el

DOM selector and wrapper utility.

```ts
el(".btn");
el(element);
el(nodeList);
el(".item", container);
```

Always returns an `Elements` instance.

---

### Elements API

#### each

```ts
el(".item").each(el => {
  console.log(el.textContent);
});
```

---

#### get

```ts
const first = el(".item").get();
```

---

#### find

```ts
el("#list").find(".row");
```

---

#### on (Scoped Events)

```ts
el(".btn").on("click", () => {
  console.log("clicked");
}, scope);
```

Listener is removed automatically when the scope is disposed.

---

#### text

```ts
el(".label").text("Hello");
const value = el(".label").text();
```

---

#### addClass / removeClass

```ts
el(".box").addClass("active");
el(".box").removeClass("active");
```

---

## View API

### Creating a View

```ts
class UserView extends View<Model<User>> {
  protected init() {
    this.$(".name").text(this.model.get("name"));

    this.model.onChange(patch => {
      if (patch.name) {
        this.$(".name").text(patch.name);
      }
    });

    this.$(".btn").on(
      "click",
      () => this.model.set({ name: "Raj" }),
      this.scope
    );
  }
}
```

---

### Instantiating a View

```ts
const view = new UserView(
  document.getElementById("app")!,
  user
);
```

---

### Scoped Selector `$`

```ts
this.$(".btn");
```

Equivalent to:

```ts
el(".btn", this.root);
```

---

### destroy

```ts
view.destroy();
```

Disposes:

* the view’s scope
* event listeners
* fetches
* polling

---

## Common Patterns

### Widget Pattern (jQuery-like)

```ts
class Dialog {
  private scope = createScope();

  constructor(private root: Element) {
    el(".close", root).on("click", () => this.close(), this.scope);
  }

  open() {
    this.root.classList.add("open");
  }

  close() {
    this.root.classList.remove("open");
  }

  destroy() {
    this.scope.dispose();
  }
}
```

---

### Progressive Enhancement

* HTML renders fully on the server
* BoneMarrow enhances behavior
* No JS → page still works

---

## Best Practices

* Always associate async work with a scope
* Use `abort: true` for UI-driven fetches
* Dispose views explicitly
* Use de-duplication only for idempotent requests
* Keep models focused and small
* Avoid global state

---

## FAQ

**Is BoneMarrow a framework?**
No. It provides primitives, not structure.

**Can it replace jQuery?**
Yes, incrementally and safely.

**Does it replace React or Vue?**
No. It solves a different class of problems.
