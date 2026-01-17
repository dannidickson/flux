<?php

namespace Flux\Extension\Forms;

class UploadFieldExtension extends FormFieldExtension
{

    public function applyFluxAttributes(string $key, string $value, ?string $fluxType): void
    {
        $this->owner->setAttribute("fx-event", "change");
        $this->owner->setAttribute("fx-proxy", "input[type='hidden']");
        $this->owner->setAttribute("fx-proxy-type", "previousElementSibling");

        parent::applyFluxAttributes($key, $value, $fluxType);
    }
}
