<?php

namespace Flux\Extension\Forms;

class HTMLEditorFieldExtension extends FormFieldExtension
{
    public function applyFluxAttributes(string $key, string $value, ?string $fluxType): void
    {
        $this->getOwner()->setAttribute("fx-event", "keyup");
        parent::applyFluxAttributes($key, $value, $fluxType);
    }
}
