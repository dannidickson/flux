# Flux directives (`fx-*`)

Flux ships a small htmx-style directive runtime in its `frontend` bundle. It runs on every Flux-enabled page — admin involvement not required.

> **Naming note** — internally these are "fx- directives" because of the attribute prefix. Possible product names to settle on:
> - **Fluxwire** — nod to Laravel Livewire
> - **Fluxlink** — hypermedia framing (HATEOAS-ish)
> - **Hyperflux** — pairs with hypermedia
> - **Fx** — keep it short, just the prefix
>
> No name is baked into the code yet. Pick one and we'll rename the runtime + docs.

## What it does

Declarative AJAX without writing JS. Drop `fx-*` attributes on any element and Flux wires up a fetch + DOM swap.

```html
<button fx-get="/news/latest" fx-target="#news-feed" fx-swap="innerHTML">
    Reload news
</button>

<div id="news-feed"></div>
```

Click the button → `GET /news/latest` → response HTML replaces `#news-feed`'s inner content.

## Attributes

| Attribute | What it does | Default |
|---|---|---|
| `fx-get="<url>"` | Issue a GET on trigger | — |
| `fx-post="<url>"` | Issue a POST on trigger. For `<form>` elements the form data is sent automatically. | — |
| `fx-trigger="<event>"` | DOM event that fires the request | per-tag (see below) |
| `fx-target="<selector>"` | Element to swap the response into | the element itself |
| `fx-swap="<strategy>"` | How to apply the response HTML | `innerHTML` |

### Default trigger per tag

| Tag | Default `fx-trigger` |
|---|---|
| `<a>`, `<button>` | `click` |
| `<input>`, `<select>`, `<textarea>` | `change` |
| `<form>` | `submit` |
| anything else | `load` (fires once on init) |

### Swap strategies

`innerHTML`, `outerHTML`, `beforebegin`, `afterbegin`, `beforeend`, `afterend`.

## Examples

**Live-search input**

```html
<input
    type="search"
    fx-get="/search"
    fx-trigger="input"
    fx-target="#results">

<ul id="results"></ul>
```

**Form submission without page reload**

```html
<form fx-post="/contact" fx-target="#contact-result" fx-swap="outerHTML">
    <input name="email">
    <button>Send</button>
</form>

<div id="contact-result"></div>
```

**Lazy-load a fragment on mount**

```html
<div fx-get="/sidebar/widget" fx-trigger="load"></div>
```

## What it intentionally doesn't do (yet)

- No SSE / WebSocket triggers
- No out-of-band swaps
- No extended trigger syntax (`every 2s`, `revealed`, etc.)
- No CSRF auto-headers (use a normal `<input name="SecurityID">` for forms)

The runtime is intentionally ~100 lines. Add features as you need them — the seam is `client/core/FxDirectives.ts`.
