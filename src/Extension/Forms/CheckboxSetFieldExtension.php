<?php

namespace Flux\Extension\Forms;

/**
 * Extension for CheckboxSetField (checkbox group)
 * Native checkboxes fire change events that bubble to the <ul> container
 */
class CheckboxSetFieldExtension extends FormFieldExtension
{
    public function applyFluxAttributes(string $key, string $value, ?string $fluxType): void
    {
        $this->getOwner()->setAttribute("fx-event", "change");
        $this->getOwner()->setAttribute("fx-collect", "input[type='checkbox']:checked");
        parent::applyFluxAttributes($key, $value, $fluxType);
    }
}
