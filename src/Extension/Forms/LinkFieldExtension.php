<?php

namespace Flux\Extension\Forms;

/**
 * Extension for UploadField
 * Defines flux attributes specific to upload fields
 */
class LinkFieldExtension extends FormFieldExtension
{

    /**
     * Apply flux-specific attributes for upload fields
     */
    public function applyFluxAttributes(string $key, string $value, ?string $fluxType): void
    {
        $this->getOwner()->setAttribute('fx-event', 'change');
        $this->getOwner()->setAttribute('fx-proxy', "input[type='hidden']");
        $this->getOwner()->setAttribute('fx-proxy-type', 'nextElementSibling');

        parent::applyFluxAttributes($key, $value, $fluxType);

        $this->getOwner()->setAttribute('fx-type', 'LinkField');
    }

}
