<?php

namespace Flux\Extension\Forms;

use SilverStripe\Dev\Debug;

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
        $this->getOwner()->setAttribute("fx-event", "change");
        $this->getOwner()->setAttribute("fx-proxy", "input[type='radio']");
        $this->getOwner()->setAttribute("fx-proxy-type", "self");
        $this->getOwner()->setAttribute("fx-proxy-multiple", "true");

        // Call parent to set common attributes
        parent::applyFluxAttributes($key, $value, $fluxType);
    }
}
