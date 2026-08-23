# Flux - Live updates for Silverstripe CMS

## About
> Type in a CMS field and the preview updates as you go.

Adds a "live update" experience to Silverstripe CMS, with minimal configuration required to get started. 

## Getting started
Add this github repo to your composer repositories array

```shell
composer config repositories.flux vcs git@github.com:dannidickson/flux.git
```

Require the module
```shell
composer require dannidickson/flux
```

**Note** Out of the box, Flux applies some extensions:
- `Flux\Extension\FluxExtension` on `PageController`, which is the preview/front end side
- `Flux\Extension\FluxLeftAndMainExtension` on `LeftAndMain`, which is the CMS side
- `Flux\Extension\FluxDataObjectExtension` to the `DataObject`, which applies the `fx-` attributes on your form fields

To opt out of the `PageController` extension, null it in your own config:
```yaml
# in app/_config/extensions.yml
---
Name: myproject-disable-flux-page-extension
After: '#flux-page-extension'
---
PageController:
  extensions:
    FluxExtension: null
```

## Telling Flux about your fields
Next you need to define the a `flux_fields` which will map a DOM element to each Field on a Page, Elemental block, or DataObject.

You can write it by hand on a Page object, like this example here
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
    'DisplayNotice' => '.display-notice', // Boolean, triggers a template update fetch when you check the checkbox
    'DisplayImage' => '.page__image', // File HasOne
    'Product' => '.page__product', // HasOne
];
```

Or you can let Flux write it for you. There is a dev command that will reads your templates, and tries to map each field to a dom element into a YAML file:

```shell
sake flux-generate-config
```

It writes `app/_config/flux-fields.yml` and prints what it mapped and what it had to skip. Run it again whenever you add a field or change a template, then flush with `?flush=1`. The command is only works in dev mode (SS_ENVIRONMENT_TYPE="dev").

This can also be run in the browser at `/dev/flux-generate-config`.

## Goals of Flux
Flux's implementation is designed as a light wrapper on your form fields but not deeply coupled, to FormFields or react components. Without requiring you to make significant changes to how your project works. You can read more about how Flux works in [how it works](docs/en/how-it-works.md). It will apply `fx-` attributes to your FormFields as well as its DOM elements.

## Supported Fields
Most of the core (including Supported modules) Silverstripe form fields are supported, with some cavets.

> [!IMPORTANT]
> **Formatting** and **Validation** do not apply during the live updates. For example an `EmailField` value is not valid it will not validate as you type. This also applies to `DateField`, `Currency`

- CheckboxField
- CheckboxSetField
- TextareaField
- TextField
  - DateField
  - EmailField
  - CurrencyField
- DropdownField and other single select fields
- OptionsetField
- HTMLEditorField
- UploadField
- LinkField 

## Developing Flux

```shell
nvm use # Node 18
yarn install
yarn watch
```

Other Javascript scripts:

```shell
yarn dev # one off development build
yarn build # lint, test, then a clean production build
yarn test # jest
yarn lint # eslint
```

PHP scripts:

```shell
vendor/bin/phpunit
vendor/bin/phpcs
vendor/bin/phpstan analyse
```

## Documentation
- [How to use Flux](docs/en/how-to.md): A general how to guide. Written mostly order of implementation
<!-- - [How it works](docs/en/how-it-works.md): How the internals work -->
