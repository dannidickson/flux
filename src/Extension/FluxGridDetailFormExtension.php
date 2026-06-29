<?php

namespace Flux\Extension;

use Flux\Context\FluxContextResolver;
use SilverStripe\Core\Extension;
use SilverStripe\Forms\Form;
use SilverStripe\Forms\LiteralField;
use SilverStripe\Security\Security;
use SilverStripe\Security\SecurityToken;

/**
 * Extends GridFieldDetailForm_ItemRequest so the Flux bootstrap shipped
 * inside the item's edit form reflects the *item* (not the parent page).
 *
 * The framework hands this hook the item record, its GridField, and the
 * parent form's record directly — no URL parsing needed. The injected
 * <script id="flux-bootstrap-data"> rides inside whatever PJAX fragment
 * the form lives in, so the host JS sees the right context on swap.
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

        // Stamp the item's owner onto its form fields. The fields already have
        // fx-key/fx-type from FluxDataObjectExtension, but a plain DataObject has
        // no getOwnerTarget(), so without this they'd broadcast owner=null and
        // updates would hit the page-level field instead of this item's region.
        //
        // The token MUST match how the resolver builds the segment owner and how
        // the DOM is stamped: elements use a selector-style anchor (#e2) from
        // getOwnerTarget(); other records use the bare id. Using the bare id for
        // an element would mismatch the "#e2" segment/DOM and silently miss.
        $ownerId = $item->hasMethod('getOwnerTarget')
            ? (string) $item->getOwnerTarget()
            : (string) $item->ID;

        foreach ($form->Fields()->dataFields() as $field) {
            if ($field->getAttribute('fx-key')) {
                $field->setAttribute('fx-owner', $ownerId);
            }
        }

        $context = (new FluxContextResolver())->forGridFieldItem($item, $parent, $relationName);
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
