# Getting started

## Install

```bash
composer require dannidickson/flux
```

## Enable on a page type

```yaml
# app/_config/extensions.yml
App\PageType\HomePage:
  extensions:
    - Flux\Extension\FluxExtension
```

`FluxExtension` is the preview-frame side. The CMS admin side is wired automatically (`FluxLeftAndMainExtension` is registered on `LeftAndMain` by the module).

## Declare your fields

For each DataObject you want live-editable, map `flux_fields` to CSS selectors in its template:

```php
class HomePage extends Page
{
    private static $db = [
        'Subtitle'  => 'Varchar(255)',
        'BodyHtml'  => 'HTMLText',
    ];

    private static $has_one = [
        'HeroImage' => Image::class,
    ];

    private static array $flux_fields = [
        'Title'     => '.page__title',
        'Subtitle'  => '.page__subtitle',
        'BodyHtml'  => '.page__body',
        'HeroImage' => '.page__hero',
    ];
}
```

Then in `getCMSFields()` call `applyFluxAttributes` so the form fields get `fx-key`, `fx-bind` and `fx-type` attributes:

```php
public function getCMSFields()
{
    $fields = parent::getCMSFields();
    // ...add/remove fields as needed...
    $this->applyFluxAttributes($fields);
    return $fields;
}
```

## Auto-generate the YAML

Instead of writing `flux_fields` by hand, point the generator at your templates:

```bash
sake flux:generate-config
# writes app/_config/flux-fields.yml
```

Re-run whenever you add a field or change a template, then flush:

```
?flush=1
```

## Elemental blocks

Blocks work the same way. Declare `flux_fields` on the element class:

```php
class CallToActionBlock extends BaseElement
{
    private static array $flux_fields = [
        'Heading' => '.cta__heading',
        'Body'    => '.cta__body',
    ];
}
```

The block's anchor (`#e123`) is used as `fx-owner` so updates target the right block in the rendered page.

## Relations (GridField)

```php
private static array $flux_relation_fields = [
    'Testimonials' => [
        'DOMSelector' => '.testimonials .testimonial',
        'Fields'      => [
            'Quote'  => '.testimonial__quote',
            'Author' => '.testimonial__author',
        ],
    ],
];
```

Each row in the GridField gets an `fx-owner` matching its record ID.

### Drag-and-drop reorder

Opt a relation into in-preview reorder by adding `DropZone` + `Sortable`:

```php
private static array $flux_relation_fields = [
    'Testimonials' => [
        'DOMSelector' => '.testimonials .testimonial',  // each item
        'DropZone'    => '.testimonials',                // container the items live in
        'Sortable'    => true,
        'Fields'      => [
            'Quote'  => '.testimonial__quote',
            'Author' => '.testimonial__author',
        ],
    ],
];
```

Requirements on the CMS side:

- The GridField must have `GridFieldOrderableRows` (`symbiote/silverstripe-gridfieldextensions`) in its config.
- `GridFieldOrderableRows` must have `immediateUpdate` enabled (the default).

Flux discovers the sort field name from the orderable component, so you don't repeat it. On drop, the frame posts a `dragEventEnd` message to the host and the host POSTs to the GridField's `data-url-reorder` — the same path a native gridfield drag would take, so any `GridFieldOrderableRows` extension hooks fire.

If `Sortable: true` is set but no `GridFieldOrderableRows` exists, the relation is left non-sortable and a warning is logged.

## Saving

By default Flux only renders live updates — actual writes happen via the normal CMS save button.

For "edit-in-preview" workflows you can use the chunked save:

```ts
// in a host-side script
window.fluxCoordinator.saveChunked()
```

It collects every pending field across Page + Elements + DataObjects and writes them in one transaction (DataObject → Element → Page).

## Verifying

1. Reload the CMS admin with `?flush=1`.
2. Open a page in split view.
3. Edit a CMS field — the preview should update without reload.
4. Click into a text node in the preview — it should become editable inline.
