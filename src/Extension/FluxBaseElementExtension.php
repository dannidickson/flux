<?php

namespace Flux\Extension;

use DNADesign\Elemental\Models\BaseElement;
use SilverStripe\Core\Extension;
use SilverStripe\ORM\DataObject;

/**
 * Gives Elemental blocks an owner token, so live edits target the block's region
 * rather than the page.
 *
 * @extends Extension<DataObject>
 */
class FluxBaseElementExtension extends Extension
{

    public function getOwnerTarget(): string
    {
        /** @var BaseElement $owner */
        $owner = $this->getOwner();

        return sprintf('#%s', $owner->getAnchor());
    }

}
