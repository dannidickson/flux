<?php

namespace Flux\Extension;

use Flux\Context\FluxContextResolver;
use SilverStripe\Core\Extension;
use SilverStripe\Forms\Form;
use SilverStripe\Forms\LiteralField;
use SilverStripe\Security\Security;
use SilverStripe\Security\SecurityToken;

/**
 * Makes the bootstrap inside a GridField item's edit form describe the item, not the
 * parent page. The injected <script> rides along in the PJAX fragment, so the host JS
 * picks up the right context on swap.
 */
class FluxGridDetailFormExtension extends Extension
{

    public function updateItemEditForm(Form $form): void
    {
        if (!Security::getCurrentUser()) {
            return;
        }

        $item = $this->getOwner()->getRecord();
        $gridField = $this->getOwner()->getGridField();

        if (!$item || !$item->exists() || !$gridField) {
            return;
        }

        $parent = $gridField->getForm()?->getRecord();
        $relationName = $gridField->getName();

        if (!$parent || !$relationName) {
            return;
        }

        if ($item->hasMethod('setFluxFields')) {
            $item->setFluxFields($form->Fields());
        }

        // Without an owner the fields broadcast owner=null and updates hit the page-level
        $ownerId = (string) $item->ID;

        if ($item->hasMethod('getOwnerTarget')) {
            $ownerId = (string) $item->getOwnerTarget();
        }

        foreach ($form->Fields()->dataFields() as $field) {
            if (!$field->getAttribute('fx-key')) {
                continue;
            }

            $field->setAttribute('fx-owner', $ownerId);
        }

        $contextResolver = new FluxContextResolver();
        $context = $contextResolver->forGridFieldItem($item, $parent, $relationName);

        if (!$context->hasContent()) {
            return;
        }

        $payload = [
            'context' => $context->jsonSerialize(),
            'contextHint' => $context->toContextHint(),
            'contextUrl' => '/flux/context',
            'csrf' => SecurityToken::getSecurityID(),
        ];

        $json = htmlspecialchars(json_encode($payload), ENT_NOQUOTES | ENT_HTML5, 'UTF-8');
        $form->Fields()->push(
            LiteralField::create(
                'FluxBootstrapData',
                '<script type="application/json" id="flux-bootstrap-data">' . $json . '</script>',
            ),
        );
    }

}
