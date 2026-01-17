<?php

namespace Flux\Extension\Forms;

use SilverStripe\Core\Extension;
use SilverStripe\Dev\Debug;
use SilverStripe\Forms\FormField;

/**
 * Extension for FormField
 * Provides base implementation for flux attributes
 * Specific field types should override applyFluxAttributes to define their own attributes
 */
class FormFieldExtension extends Extension
{
    /**
     * Apply flux-specific attributes to this field
     * FormFields require have a key, bind-to (DOM target) and type
     *
     * Override this method in specific field extensions to set field-specific attributes
     */
    public function applyFluxAttributes(string $key, string $value, ?string $fluxType): void
    {
        $this->getOwner()->setAttribute("fx-key", $key);
        $this->getOwner()->setAttribute("fx-bind", $value);
        $this->getOwner()->setAttribute("fx-type", $fluxType);

        // if ($fluxType) {
        //     $this->getOwner()->setAttribute("fx-event", 'keyup');
        // }
    }

    /**
     * Apply owner target attribute if available
     */
    public function applyFluxOwnerAttribute($owner): void
    {
        if ($owner && method_exists($owner, 'getOwnerTarget')) {
            $ownerTarget = $owner->getOwnerTarget();
            if ($ownerTarget) {
                $this->getOwner()->setAttribute("fx-owner", $ownerTarget);
            }
        }
    }
}
