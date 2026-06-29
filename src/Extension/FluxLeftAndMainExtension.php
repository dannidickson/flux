<?php

namespace Flux\Extension;

use Flux\Context\FluxContext;
use Flux\Context\FluxContextResolver;
use Flux\Core\Configuration;
use SilverStripe\Core\Extension;
use SilverStripe\Forms\LiteralField;
use SilverStripe\Security\Security;
use SilverStripe\Security\SecurityToken;
use SilverStripe\View\Requirements;

/**
 * v2: thin shim around FluxContextResolver.
 *
 * Responsibilities:
 *  - Mount host JS.
 *  - Register a `FluxBootstrap` fragment on PjaxResponseNegotiator so any
 *    PJAX response carries a fresh bootstrap payload.
 *  - Inject inline window.FluxBootstrap for the initial full-page load.
 *
 * v1's `setActiveRelation`, GridFieldDetailForm shimming, and middleware
 * body-rewriting are gone — `LeftAndMain::currentRecordID()` already
 * resolves nested GridField items via `CMSMainCurrentRecordID`.
 */
class FluxLeftAndMainExtension extends Extension
{
    public function onBeforeInit(): void
    {
        if (!Security::getCurrentUser()) {
            return;
        }

        Requirements::javascript('dannidickson/flux: client/dist/js/bind/host.js');
        Requirements::javascript('dannidickson/flux: client/dist/js/silverstripe-cms/host.js');
    }

    public function onAfterInit(): void
    {
        if (!Security::getCurrentUser()) {
            return;
        }

        $payload = $this->getBootstrap();
        if ($payload === null) {
            return;
        }

        Requirements::customScript(
            'window.FluxBootstrap = ' . json_encode($payload) . ';',
            'flux-bootstrap',
        );
    }

    public function updateEditForm(&$form)
    {
        $payload = $this->getBootstrap();
        if ($payload !== null) {
            $json = htmlspecialchars(json_encode($payload), ENT_NOQUOTES | ENT_HTML5, 'UTF-8');
            $form->Fields()->push(
                LiteralField::create(
                    'FluxBootstrapData',
                    '<script type="application/json" id="flux-bootstrap-data">' . $json . '</script>',
                ),
            );
        }
    }

    private function getBootstrap(): ?array
    {
        $context = (new FluxContextResolver())->forLeftAndMain($this->getOwner());

        if (!$context->hasContent()) {
            return null;
        }

        return [
            'context' => $context->jsonSerialize(),
            'contextHint' => $context->toContextHint(),
            'contextUrl' => '/flux/context',
            'csrf' => SecurityToken::getSecurityID(),
            'inlineEditorEnabled' => (bool) Configuration::config()->get('enable_inline_editor'),
        ];
    }
}
