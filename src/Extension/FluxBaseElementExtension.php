<?php

namespace Flux\Extension;

use SilverStripe\Core\Extension;
use SilverStripe\ORM\DataObject;
use DNADesign\Elemental\Models\BaseElement;

/**
 * Flux extension for BaseElement
 *
 * Enables live-editing for Elemental blocks in the CMS admin interface
 * This extends BaseElement DataObjects to add FluxConfig when edited in admin
 *
 * @extends Extension<DataObject>
 */
class FluxBaseElementExtension extends Extension
{
    public function getOwnerTarget(): string
    {
        /* @var BaseElement */
        return sprintf('#%s', $this->getOwner()->getAnchor());
    }
}
