<?php

namespace Flux\Extension\Forms;

use SilverStripe\Dev\Debug;

class TextFieldExtension extends FormFieldExtension
{
    public function applyFluxAttributes(string $key, string $value, ?string $fluxType): void
    {
        parent::applyFluxAttributes($key, $value, $fluxType);

        $this->getOwner()->setAttribute("fx-event", "keyup");
    }
}
