<?php

namespace Flux\Extension;

use SilverStripe\Control\RequestHandler;
use SilverStripe\Core\Extension;
use SilverStripe\Forms\FieldList;
use SilverStripe\ORM\DataObject;

/**
 * Re-applies Flux attributes to forms built by a FormFactory, especially elemental's inline block form.
 * {@see FluxDataObjectExtension} sets those attributes during `updateCMSFields`, which runs inside
 * parent::getCMSFields(), so a field the record re-adds after that call never gets
 * fx-key/fx-bind/fx-owner; `updateFormFields` runs once the FieldList is complete.
 *
 * @extends Extension<\SilverStripe\Forms\DefaultFormFactory>
 */
class FluxFormFactoryExtension extends Extension
{

    /**
     * @param array $context Form factory context; carries the record under `Record`.
     */
    public function updateFormFields(
        FieldList $fields,
        ?RequestHandler $controller = null,
        string $name = '',
        array $context = [],
    ): void {
        $record = $context['Record'] ?? null;

        if (!$record instanceof DataObject || !$record->hasMethod('setFluxFields')) {
            return;
        }

        // Does nothing when the record has no flux_fields config, so this is safe to call on every form.
        $record->setFluxFields($fields);
    }

}
