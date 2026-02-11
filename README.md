# Flux - Live updates for Silverstripe CMS


> [!WARNING]
> This is very much a conceptual module, use at own risk.
> Documentation may be nonsensical or just frankly does not exist at the moment

## About
Adds live updates to the Silverstripe CMS, with minimal configuration required to add text updates. With some ideas around a "livewire" like experience.

## Getting started
Add this github repo to your composer repositories array

```shell
composer config repositories.flux vcs git@github.com:dannidickson/flux.git
```

Require the module
```shell
composer require dannidickson/flux
```
In your project add the following extension
```yaml
# in config/extensions.yaml 
PageController:
  extensions:
    - Flux\Extension\FluxExtension
```

In your project, on a Page object you can add the `flux_fields`, like this example here
```php
private static $db = [
    "DisplayNotice" => "Boolean",
];

private static $has_one = [
    "DisplayImage" => File::class,
    "Product" => Product::class
];

private static array $flux_fields = [
    'Title' => '.page__title', // a class on the Page template (any querySelector path is valid)
    'Content' => '.page__html',
    'DisplayNotice' => '.display-notice', // Matches the HasOne key and triggers a template update fetch when you check the checkbox
    'DisplayImage' => '.page__image', // File HasOne
    'Product' => '.page__product', // HasOne
];
```

Then in your getCMSFields call, you can add the `applyFluxAttributes` to add attributes to the form fields.
```php
public function getCMSFields()
{
    $fields = parent::getCMSFields();
    // add fields etc

    $this->applyFluxAttributes($fields);
    return $fields;
}
```

## Goals of Flux
Flux's implementation is designed as a light wrapper on your form fields but not deeply coupled, to FormFields or react components. Without requiring you to make significant changes to how your project works. You can read more abut how Flux works here. It will apply `fx-` attributes to your FormFields as well as its DOM elements.

## Supported Fields
Most of the core (including Supported modules) Silverstripe form fields are supported, with some cavets. 

> [!IMPORTANT]
> **Formatting** and **Validation** do not apply during the live updates. For example an `EmailField` value is not valid it will not validate as you type. This also applies to `DateField`, `Currency`

- CheckboxField
- TextareaField
- TextField
  - DateField
  - EmailField
  - CurrencyField
- HtmlEditorField - Refer to known issues
- UploadField

**TODO**:
- DropdownField

**Not supported**
- PasswordField: Will throw an error if you try to do this.

## How this all works
> [!WARNING]
> DRAFT Content and will not be correct
- During load form creation it adds `fx-key`, `fx-event` and so forth to FormFields
- Adding all of these into the `FluxConfigService` which builds out a map of the active page and any elemental blocks you have
- When `onAfterInit` on the LeftAndMain it will send the FluxConfig to javascript as a `window.FluxConfig` 

**Front end**
Note this will only apply if you're in the CMS and the frame has the CMSPreview variable
- Goes through the `FluxConfig` and creates the `FluxLiveState`
- This will add a `fx-object-ref` to each of the mapped fields via the `flux_fields` array. EG: `'Title' => '.page__title'` will add the following to the DOM `<h2 class="page__title" fx-object-id="1">` and within the FluxLiveState

## Known issues
### LinkField support
Currently there is no default support for linkfield

### HTMLEditorField support
At the moment HTMLEditorField will send the content via a `textUpdate` which is just for text updates (read more in the how it works section). In a future update I plan to check if the content contains a shortcode `[image src="..."]`, if it does, it will send a `shortCodesFragmentPatch` event that will fire an API request and return the HTML and patch it. This will be debounced like the `pageTemplateUpdate` event. When it doesnt include shortcodes it will just be sent as a `textUpdate`
