<?php

namespace Flux\Extension\Forms;

/**
 * Extension for OptionsetField (radio group)
 * Defines flux attributes specific to radio button groups
 */
class OptionsetFieldExtension extends FormFieldExtension
{

    /**
     * Apply flux-specific attributes for optionset/radio fields
     */
    public function applyFluxAttributes(string $key, string $value, ?string $fluxType): void
    {
        $this->getOwner()->setAttribute('fx-event', 'change');

        parent::applyFluxAttributes($key, $value, $fluxType);
    }

}
