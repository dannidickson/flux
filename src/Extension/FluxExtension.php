<?php

namespace Flux\Extension;

use Flux\Context\FluxContextResolver;
use Flux\Core\Configuration;
use SilverStripe\Control\Controller;
use SilverStripe\Control\Middleware\HTTPCacheControlMiddleware;
use SilverStripe\Core\Extension;
use SilverStripe\ORM\DataObject;
use SilverStripe\Security\SecurityToken;
use SilverStripe\View\Requirements;

/**
 * Injects page context inline as `window.FluxFrameContext`
 * Preview frame will apply the fx directives on load
 * Rather than waiting for the host (CMS)
 *
 * @extends Extension<object>
 */
class FluxExtension extends Extension
{

    public function onBeforeInit(): void
    {
        if (!Configuration::config()->get('enable_auto_set_fields')) {
            return;
        }

        Requirements::javascript('dannidickson/flux: client/dist/js/frontend.js');

        $request = Controller::curr()->getRequest();

        if (!$request->getVar('CMSPreview') || !SecurityToken::getSecurityID()) {
            return;
        }

        // Preview frame has a stable URL, so mark it uncacheable to avoid stale copies on reload.
        HTTPCacheControlMiddleware::singleton()->disableCache();

        Requirements::css('dannidickson/flux: client/dist/styles/preview.css');
        Requirements::javascript('dannidickson/flux: client/dist/js/bind/frame.js');
        Requirements::javascript('dannidickson/flux: client/dist/js/silverstripe-cms/frame.js');

        $this->injectFrameContext();
    }

    private function injectFrameContext(): void
    {
        $record = $this->getOwner()->data();

        if (!($record instanceof DataObject) || !$record->exists()) {
            return;
        }

        $context = (new FluxContextResolver())->forRecord($record);

        if (!$context->hasContent()) {
            return;
        }

        $inlineEditorEnabled = (bool) Configuration::config()->get('enable_inline_editor');
        $inlineEditorFlag = 'false';

        if ($inlineEditorEnabled) {
            $inlineEditorFlag = 'true';
        }

        Requirements::customScript(
            'window.FluxFrameContext = ' . json_encode($context->jsonSerialize()) . ';'
                . 'window.FluxCsrf = ' . json_encode(SecurityToken::getSecurityID()) . ';'
                . 'window.FluxInlineEditorEnabled = ' . $inlineEditorFlag . ';',
            'flux-frame-context',
        );
    }

}
