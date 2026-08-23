<?php

namespace Flux\Extension\Forms;

use SilverStripe\Core\Extension;

/**
 * Base flux attributes for every FormField. Field-type extensions override
 * applyFluxAttributes() to add their own.
 */
class FormFieldExtension extends Extension
{

    /**
     * Every FormField needs a key, a bind target (DOM selector) and a type.
     */
    public function applyFluxAttributes(string $key, string $value, ?string $fluxType): void
    {
        $this->getOwner()->setAttribute('fx-key', $key);
        $this->getOwner()->setAttribute('fx-bind', $value);
        $this->getOwner()->setAttribute('fx-type', $fluxType);
    }

    /**
     * For a relation (has_one, has_many) it requires an owner id (target)
     */
    public function applyFluxOwnerAttribute(?object $owner): void
    {
        if (!$owner || !method_exists($owner, 'getOwnerTarget')) {
            return;
        }

        $ownerTarget = $owner->getOwnerTarget();

        if (!$ownerTarget) {
            return;
        }

        $this->getOwner()->setAttribute('fx-owner', $ownerTarget);
    }

}
