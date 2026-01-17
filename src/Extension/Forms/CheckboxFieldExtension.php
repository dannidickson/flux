<?php

namespace Flux\Extension\Forms;

/**
 * Extension for Boolean/Checkbox fields
 * Defines flux attributes specific to boolean input fields
 */
class CheckboxFieldExtension extends FormFieldExtension
{
    /**
     * Apply flux-specific attributes for boolean fields
     */
    public function applyFluxAttributes(string $key, string $value, ?string $fluxType): void
    {
        parent::applyFluxAttributes($key, $value, $fluxType);

        $this->getOwner()->setAttribute("fx-event", "click");
    }
}
