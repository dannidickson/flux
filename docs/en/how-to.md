# How to use Flux

I've written this in a general order of how you might go about implementing Fluxn. 

<!-- There is also a "how it works" document. Which explains at a very high level what goes on, and well "how it works"
see [how it works](how-it-works.md). -->

## Contents
- [Mapping your fields](#mapping-your-fields)
- [Auto generate the config](#auto-generate-the-config)
- [Field config reference](#field-config-reference)
- [Supported fields](#supported-fields)
- [Elemental blocks](#elemental-blocks)
- [Module configuration](#module-configuration)
- [Flux directives (`fx-*`)](#flux-directives-fx-)

## Mapping your fields

Flux binds a field to a DOM element, so each field you want live needs an element it can own. A class is the easiest thing to target.

```html
<h1 class="page__title">$Title</h1>
<div class="page__body">$Content</div>
```

Then map the field name to that element with `flux_fields`.

```php
class HomePage extends Page
{
    private static $db = [
        'Subtitle' => 'Varchar(255)',
        'BodyHtml' => 'HTMLText',
    ];

    private static $has_one = [
        'HeroImage' => Image::class,
    ];

    private static array $flux_fields = [
        'Title' => '.page__title',
        'Subtitle' => '.page__subtitle',
        'BodyHtml' => '.page__body',
        'HeroImage' => '.page__hero',
    ];
}
```

You can also write it in a YAML file if you prefer. 

```yaml
App\PageType\HomePage:
  flux_fields:
    Title: '.page__title'
    Subtitle: '.page__subtitle'
```

Flush with `?flush=1`, open the page in the CMS, switch the preview to split view, and type in the Title field. The heading in the preview should change with you.

### Out of the Box
By default Flux is enabled. You do not need to apply the `FluxExtension` yourself, as its applied to the PageController. You can restrict this (read below)

You will also not need to call `applyFluxAttributes($fields)` at the end of `getCMSFields()`. Flux hook into the `updateCMSFields` and the form factory, so attributes are applied for you.

`applyFluxAttributes` can be called if you need to apply them.

```php
public function getCMSFields()
{
    $fields = parent::getCMSFields();

    $this->applyFluxAttributes($fields);
    return $fields;
}
```

## Restricting Flux 
If you want to restrict Flux to a specific page type or feature set. You can do so by disabling the page

``` yaml
#   ---
#   Name: myproject-disable-flux-page-extension
#   After: '#flux-page-extension'
#   ---
PageController:
    extensions:
        FluxExtension: null

# Your page
App\PageTypes\ExampleDemoPage:
    extensions:
        FluxExtension: Flux\Extension\FluxExtension
```

## Auto generate the config
It might be tedious to write all the fields for your page types, blocks, so you can run a dev command locally. This will read your templates and tries to match the DOM selectors for you.

```shell
sake flux-generate-config
```

You can also run it in the browser at `/dev/flux-generate-config?flush=1`. It is only registered in dev mode.

By default it writes `app/_config/flux-fields.yml`, which will add the `flux_fields` to each of the `DataObject`. Re-run it whenever you add a field or change a template, best to flush when running it.

| Option | What it does |
|---|---|
| `--output`, `-o` | Where to write the YAML. Defaults to `app/_config/flux-fields.yml` |
| `--dry-run` | Print the config without writing anything |
| `--dump-ast` | You can see the parsed AST used by Flux, might be useful if you are wondering why it didn't pick it up.  |
| `--ast-output` | Where to write that AST. Defaults to `app/_config/flux-ast.yml` |

It looks at every `DataObject` subclass that has a `db` config and a template, minus anything in `Configuration::excluded_classes`. For each template it parses the source, walks the scopes (`<% loop %>`, `<% with %>`, `<% if %>`, `<% include %>`), and for each field works out the closest element that wraps only that field. That element becomes the selector.

### Reading the output
The command prints what it mapped, and what it could not.

```
App\PageType\HomePage
  Title                  → .page__title
  Content                → .page__body
  Summary                ✗ skipped: no-unique-selector (.card, .card)
  (3 other reference(s) ignored: non-fields or unresolved scopes)
```

Skips it prints in full are ones you can act on:

| Reason | What to do |
|---|---|
| `no-unique-selector` | Two or more elements matched the same selector. Add a class to the one you want. |
| `not-sole-content` | The element holds the field plus other content, so updating it would clobber the rest. Wrap the field in its own element. |
| `attribute` | The field is only used inside an HTML attribute. Bind it to an element instead, or use the 'Long Form definition' and include `UpdateMode: templateUpdate`. |

Anything else, template variables that are not fields, scopes it could not resolve, is tallied on the last line rather than printed. 

The generated file is a YAML file, and can be edited. So you can tweak the file after adjusting any templates. **Note**: the generator task does override the output file every time its run. 

## Field config reference
Flux reads three custom properties off a `DataObject`, so subclasses inherit and merge them.

### `flux_fields`
Maps a field name to the element in your template that holds it. The key is a `db` field name, or a `has_one` name (use `Product`, not `ProductID`). The value is either a selector string, or a map when you need more than the default behaviour.

```php
private static array $flux_fields = [
    'Title' => '.page__title',
    'HeroImage' => [
        'DOMSelector' => '.page__hero img',
        'UpdateMode' => 'templateUpdate',
    ],
];
```

| Key | Meaning |
|---|---|
| `DOMSelector` | Any `querySelectorAll` path. Though I do not recommend it, comma separated selectors are allowed. `header > .menu-title, div.hero .title` |
| `UpdateMode` | How the change is applied, see below. Defaults to `textUpdate`. |
| `IsConditional` | Set by the generator when the field is an `<% if %>` statement, with no output |

| Update mode | What happens |
|---|---|
| `textUpdate` | Simple text fields. No change to the DOM structure. This will send directly from the Host (CMS) to the Preview Frame. No API request |
| `templateUpdate` | Full re-render of the page. Will send the `ChangeSet` (draft changes) data to the server via an API request, apply the changes, and morph the DOM back. Used when the fields / block alters the DOM structure. Like selecting a Checkbox that would hide / show something inside an `<% if %>` statement or an attribute. |
| `patchUpdate` | Reserved, not implemented. Would allow you to update a specific area of the HTML. For example a Link, or a specific item within a relation. |

### `flux_fieldtypes`
Types are Silverstripe form schema types, which is what tells the front end how to treat the value. You can override the type Flux infers for a field. 

```php
private static array $flux_fieldtypes = [
    'Category' => 'SingleSelect',
];
```

You may not need this, as mentioned Flux does tries to infer the type from the DataObject schema; `db`, `has_one` fields. `has_many` fields are all treated as `flux_relation_fields`.

| Config | Inferred type |
|---|---|
| Anything containing `HTML` | `HTML` |
| Anything containing `File` or `Image` | `FileUpload` |
| Anything containing `Link` | `LinkField` |
| Everything else | defaults to `Text` |

The generator writes `flux_fieldtypes` for you where the inferred type would be wrong, mainly `has_one` relations and `Enum` fields, by asking the actual form field what schema type it reports.

### `flux_relation_fields`
Maps a `has_many` or `many_many` relation to the repeated element in your template. See [relations and GridFields](#relations-and-gridfields).

### What it looks like on the DOM
Assuming that we've mapped a title like `'Title' => '.page__title'`
Flux will apply some 'fx-' attributes to the FormField (as explained above). The HTML will end up looking like:
```html
<!-- CMS Form Field -->
<input name="Title" fx-key="Title" fx-bind=".page__title" fx-type="Text" fx-event="keyup" fx-event-type="textUpdate">

<!-- Actual Preview output -->
<h1 class="page__title" fx-key="Title" fx-type="Text">
    Title
</h1>
```

## Supported fields
This module does try to support all the core Silverstripe Form Fields, including ones within the Supported Modules list. 

> [!IMPORTANT]
> **Formatting** and **Validation** do not apply during the live updates. If an `EmailField` value is not valid it will not validate as you type. The same goes for `DateField` and `Currency`, you see the raw value you typed, not the cast one. The real value is validated and cast when you save.

| Field | Event | How the update is applied |
|---|---|---|
| `TextField` and its subclasses (`EmailField`, `DateField`, `CurrencyField`, `NumericField`) | `keyup` | Text written straight into the bound element |
| `TextareaField` | `keyup` | Text |
| `HTMLEditorField` | TinyMCE `input` and `Change` | The editor's markup is sent to the server via a `/flux/shortCodesFragmentPatch`. So that shortcodes can work; so you see the Image and not `[image ...]`. When there are no shortcodes, its treated as a textUpdate |
| `CheckboxField` | `click` | Triggers a re-render (pageTemplateUpdate) |
| `CheckboxSetField` | `change` | Collects the checked inputs and re-renders |
| `OptionsetField` | `change` | Re-render |
| `DropdownField` and other single select fields | `change` | Re-render. The React component's hidden input is watched, since the visible control is not a plain `<select>`. |
| `UploadField` | `change` | Re-render. Same hidden input approach. |
| `LinkField` | `change` | Re-render, see the caveat below |

**LinkField**
`LinkFieldController` has no `updateForm` extension point out of the box, so Flux cannot get its attributes onto the fields inside the link modal. Against an unmodified `silverstripe/linkfield` the field will not update live.

**Anything Flux cannot read a value off**
Structural fields, or custom React components with no hidden input / way for the dom to detect changes, will not bind.

### Adding your own
Field behaviour lives in one small extension per field type, in `src/Extension/Forms`. They all extend `FormFieldExtension` and override `applyFluxAttributes()` to add whatever the field needs.

```php
class MyFieldExtension extends FormFieldExtension
{
    public function applyFluxAttributes(string $key, string $value, ?string $fluxType): void
    {
        parent::applyFluxAttributes($key, $value, $fluxType);

        $this->getOwner()->setAttribute('fx-event', 'change');
    }
}
```

Then apply it in your own YAML.

```yaml
My\Forms\MyField:
  extensions:
    MyFieldExtension: My\Extension\MyFieldExtension
```

| Attribute | What it is for |
|---|---|
| `fx-key` | The field name |
| `fx-bind` | The selector from `flux_fields` |
| `fx-type` | The value type, which decides whether a change is patched or re-rendered |
| `fx-event` | The DOM event to listen on |
| `fx-event-type` | The `UpdateMode` from config |
| `fx-owner` | For relations (has_one, has_many). Its the ID for record. Flux has a way to chain together the update path. |
| `fx-proxy` | Proxy for fields that are react. Such as hidden a hidden input to watch, when the visible control is a React component. This is how the Modal for Upload / Link field works. |
| `fx-proxy-type` | Where to look for it, `previousElementSibling`, `nextElementSibling`, `self` or `default` |
| `fx-collect` | Selector for multiple inputs whose values are collected as one value. EG CheckboxSetField |

## Elemental blocks
Blocks work the same way as pages. Declare `flux_fields` on the element class and map each field to the element in the block's template.

```php
class CallToActionBlock extends BaseElement
{
    private static array $flux_fields = [
        'Heading' => '.cta__heading',
        'Body' => '.cta__body',
    ];
}
```

The generator picks blocks up too.

If your blocks do not include the block's `anchor` id. The block will likely not have anything for Flux to map and scope into. As Flux uses the block's anchor as the `fx-owner`.

When the block changes (background colour or link is added), and needs to re-render. Flux will post the block's `ChangeSet` and render just block on the server and morph it back clientside (using the anchor id). Instead of rendering the entire page. It may fallback to a full page update.

## Module configuration
Module level settings live on `Flux\Core\Configuration`.

```yaml
Flux\Core\Configuration:
  enable_auto_set_fields: true
  enable_inline_editor: false
  excluded_classes:
    - App\PageType\SearchPage
```

| Setting | Default | What it does |
|---|---|---|
| `enable_auto_set_fields` | `true` | The master switch for the front end side. When false, `FluxExtension` stops loading anything and stops injecting page context, so nothing binds on the rendered page. |
| `enable_inline_editor` | `false` | Passes an inline editing flag through to the preview. Off by default. |
| `excluded_classes` | `RedirectorPage`, `ErrorPage`, `VirtualPage` | Classes the config generator skips, and which never get live updates. It merges, so you only add your own. |

To remove the config generator command:

```yaml
---
Name: myproject-flux-dev-commands
After: '#flux-dev-commands'
---
SilverStripe\Dev\DevelopmentAdmin:
  commands:
    flux-generate-config: null
```

## Flux directives (`fx-*`)
> [!NOTE]
> Experimental feature

>Flux also ships a small htmx style directive runtime in its front end bundle.

> The `fx-` prefix is shared with the CMS live update attributes (`fx-key`, `fx-bind`, `fx-owner`). They are unrelated systems that share a common prefix.

Like HTMX is an attributes based way to add interactivity to a page. Here are some examples

```html
<button fx-get="/news/latest" fx-target="#news-feed" fx-swap="innerHTML">
    Reload news
</button>

<div id="news-feed"></div>
```

Click the button, `GET /news/latest`, response HTML replaces `#news-feed`'s inner content.

| Attribute | What it does | Default |
|---|---|---|
| `fx-get="<url>"` | Issue a GET on trigger | — |
| `fx-post="<url>"` | Issue a POST on trigger. For `<form>` elements the form data is sent automatically. | — |
| `fx-trigger="<event>"` | DOM event that fires the request | per tag, see below |
| `fx-target="<selector>"` | Element to swap the response into. `this` means the element itself. | the element itself |
| `fx-swap="<strategy>"` | How to apply the response HTML | `innerHTML` |
| `fx-param="<name>"` | Name of the query param a GET sends the element's value as | the element's `name`, else `q` |
| `fx-debounce="<ms>"` | How long to wait after the last event before firing | `300` for typing triggers, `0` for the rest |

If an element has both `fx-get` and `fx-post`, the GET wins.

> [!WARNING]
> Sending the element's value is **very experimental**. A GET fired from an `<input>`, `<select>` or `<textarea>` appends that element's value to the URL as a query param. Nothing else is sent, and a POST sends nothing unless it is on a `<form>`. Expect this to change.

| Tag | Default `fx-trigger` |
|---|---|
| `<a>`, `<button>` | `click` |
| `<input>`, `<select>`, `<textarea>` | `change` |
| `<form>` | `submit` |
| anything else | `load`, fires once on init |

`click` and `submit` calls `preventDefault()`, so a link or a form will not also navigate.

Swap strategies are `innerHTML`, `outerHTML`, `beforebegin`, `afterbegin`, `beforeend`, `afterend`. As a fallback it will use the `innerHTML`.

### Debouncing
Requests from `input`, `keyup`, `keydown`, `keypress`, `search` and `change` include a default debounce of 500ms. Everything else, a click or a submit, fires straight away.

Set your own wait with `fx-debounce`, in milliseconds.

```html
<input type="search" fx-get="/search" fx-trigger="input" fx-target="#results" fx-debounce="500">
```

`fx-debounce="0"` turns it off and fires on every event. A value that is not a positive number logs a warning and falls back to 300ms.

Only the last event in a burst fires, so an in flight request is not cancelled, it is simply never started.

**A live search input**

```html
<input type="search" fx-get="/search" fx-trigger="input" fx-target="#results">

<ul id="results"></ul>
```

Typing fires `GET /search?q=<what you typed>` once you stop for 300ms, and the response replaces the contents of `#results`. The input has no `name`, so the param falls back to `q`. Name the input, or set `fx-param`, to send something else.

```html
<input type="search" name="term" fx-get="/search" fx-trigger="input" fx-target="#results">
```

That one sends `GET /search?term=<what you typed>`.

**A form without a page reload**

```html
<form fx-post="/contact" fx-target="#contact-result" fx-swap="outerHTML">
    <input name="email">
    <button>Send</button>
</form>

<div id="contact-result"></div>
```

**Lazy load a fragment on mount**

```html
<div fx-get="/sidebar/widget" fx-trigger="load"></div>
```
