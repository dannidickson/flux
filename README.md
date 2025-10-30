# Flux - Live updates for Silverstripe CMS

> [!NOTE]
> This is very much a conceptual module, use at own risk.
> Documentation may be nonsensical or just frankly does not exist at the moment.

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
``` php
public function getCMSFields()
{
    $fields = parent::getCMSFields();
    // add fields etc

    $this->applyFluxAttributes($fields);
    return $fields;
}
```

### Goals
- Implementation is applied as a wrapper, not deeply integrated within the FormFields / react components. So it applies attributes `fx-key` etc
