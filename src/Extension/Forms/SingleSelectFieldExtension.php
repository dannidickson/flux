<?php

namespace Flux\Extension\Forms;

class SingleSelectFieldExtension extends FormFieldExtension
{

    public function applyFluxAttributes(string $key, string $value, ?string $fluxType): void
    {
        parent::applyFluxAttributes($key, $value, $fluxType);

        $this->getOwner()->setAttribute("fx-event", "change");
        $this->getOwner()->setAttribute("fx-proxy", "input[type='hidden']");
        $this->getOwner()->setAttribute("fx-proxy-type", "default");

    }

}
