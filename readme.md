## 🦴 BoneMarrow

**BoneMarrow** is a lightweight, lifecycle-aware JavaScript/TypeScript library for building structured UI logic on top of server-rendered HTML — without jQuery, virtual DOMs, or heavyweight frameworks.

It provides a small set of **explicit primitives** for managing UI behavior, async operations, and state in a predictable way.

---

## Why BoneMarrow?

Modern web apps often fall into two extremes:

* **jQuery-style code** that becomes unmaintainable at scale
* **SPA frameworks** that are too heavy for many server-rendered apps

BoneMarrow sits in between.

It helps you:

* Modernize legacy applications incrementally
* Replace jQuery patterns safely
* Keep server-rendered HTML
* Avoid framework lock-in
* Write code that is easy to reason about and debug

---

## Core Ideas

* **Explicit lifecycles** using scopes
* **Abort-safe async** by default
* **No hidden background work**
* **No global mutable state**
* **No `$`**
* **No magic**

If something happens, you should know *where*, *when*, and *why*.

---

## What BoneMarrow Provides

### Scope

A lifecycle container that:

* Owns async work
* Aborts fetches on disposal
* Cleans up event listeners
* Supports parent / child scopes

### Fetch Pipeline

A unified fetch helper with optional:

* abort
* timeout
* retry on failure
* scope-local request de-duplication

### Model

* Simple observable state
* Patch-based updates
* Fetch and auto-refresh support

### Collection

* List-based state
* Reset semantics
* Fetch and auto-refresh support

### Auto Refresh

* Sequential polling (no overlapping requests)
* Next refresh starts only after the previous fetch completes

### DOM Utilities

* `el()` selector helper
* `Elements` wrapper
* Scoped event handling

### View

* UI composition primitive
* Owns a DOM root and scope
* Automatic cleanup on destroy

---

## Quick Example

```ts
const user = new bone.Model({ name: "John" });

class UserView extends bone.View<typeof user> {
    protected init() {
        this.$(".name").text(this.model.get("name"));

        this.model.onChange(patch => {
            if (patch.name) {
                this.$(".name").text(patch.name);
            }
        });

        this.$(".btn").on(
            "click",
            () => this.model.set({ name: "Smith" }),
            this.scope
        );
    }
}

new UserView(document.getElementById("app")!, user);
```

Everything created inside the view:

* is scoped
* is cleaned up automatically
* stops when the view is destroyed

---

## Sequential Auto Refresh (Polling)

```ts
user.autoRefresh("/api/user/42", {
    scope: this.scope,
    interval: 5000,
    fetch: { abort: true }
});
```

Actual behavior:

```
fetch → complete → wait 5s → fetch → complete → wait 5s
```

No overlapping requests. No runaway timers.

---

## jQuery-like UI, Without jQuery

BoneMarrow is well suited for building:

* dialogs
* dropdowns
* tabs
* dashboards
* admin panels

All with:

* explicit ownership
* predictable cleanup
* no global state

---

## Progressive Enhancement Friendly

BoneMarrow works best when:

* HTML is rendered by the server
* JavaScript enhances behavior
* Pages still work without JS

Perfect for:

* ASP.NET MVC / Razor
* Rails
* PHP
* Django
* Large legacy apps

---

## Documentation

* Full documentation is available in **`DOCS.md`**
* Includes detailed API reference
* Covers scopes, fetch, models, collections, views, and patterns

---

## Bundle Size

BoneMarrow is intentionally small and dependency-free.

| File                     | Size        |
| ------------------------ |-------------|
| `dist/bonemarrow.js`     | **54.7 kB** |
| `dist/bonemarrow.min.js` | **19.3 kB** |

Sizes shown are **raw file sizes**, not gzipped.
BoneMarrow favors clarity and debuggability over compression tricks.

---

## What BoneMarrow Is Not

* ❌ Not a framework
* ❌ Not a virtual DOM
* ❌ Not reactive magic
* ❌ Not an SPA replacement

BoneMarrow provides **primitives**, not rules.

---

## License

BoneMarrow is licensed under the **Apache License, Version 2.0** starting from version **1.2.0**.

Versions **1.1.3 and earlier** remain available under the **MIT License**.

You may use versions ≤ 1.1.3 under MIT terms.
All versions ≥ 1.2.0 are governed by Apache License 2.0.

See the `LICENSE` file for full details.

---

## Final Thought

> **BoneMarrow is intentionally boring.  
> Boring code scales.**

If you want clarity, explicit lifecycles, and predictable async behavior without the weight of a framework, BoneMarrow is built for that.
