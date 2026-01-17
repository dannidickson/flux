<?php

namespace Flux\Extension\Forms;

use Exception;

class ThrowErrorForPasswordFieldExtension extends FormFieldExtension
{
    public function applyFluxAttributes(string $key, string $value, ?string $fluxType): void
    {
        throw new Exception('Trying to apply flux attributes to PasswordField. You should not be doing this');
    }
}
