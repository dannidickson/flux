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
 * Preview-frame extension on ContentController.
 *
 * Mounts the preview JS bundle when rendered with ?CMSPreview=1, and — like v1 —
 * injects the full page-scoped context (field keys + DOM selectors + relation
 * maps) inline as `window.FluxFrameContext`. The frame applies it on
 * DOMContentLoaded, so directives are re-stamped on every load/reload without
 * depending on a host message arriving first.
 *
 * The host still pushes a narrower block / relation-item scope over the channel
 * when one is being edited; that push wins over this page-scoped boot context.
 *
 * @extends Extension<object>
 */
class FluxExtension extends Extension
{
    public function onBeforeInit(): void
    {
        Requirements::javascript('dannidickson/flux: client/dist/js/frontend.js');

        $request = Controller::curr()->getRequest();
        if (!$request->getVar('CMSPreview') || !SecurityToken::getSecurityID()) {
            return;
        }

        // The preview frame has a stable URL, so the browser caches the rendered
        // HTML and serves a stale copy on the next load — which is why it only
        // refreshed with ?flush=1. Elemental sidesteps this with a random
        // ?ElementalPreview= cache-buster; the clean equivalent is to mark the
        // preview render uncacheable so the browser always re-fetches it.
        HTTPCacheControlMiddleware::singleton()->disableCache();

        Requirements::css('dannidickson/flux: client/dist/styles/preview.css');
        Requirements::javascript('dannidickson/flux: client/dist/js/bind/frame.js');
        Requirements::javascript('dannidickson/flux: client/dist/js/silverstripe-cms/frame.js');

        $this->injectFrameContext();
    }

    /**
     * Inline the previewed record's context so the frame is self-sufficient on
     * load. The previewed record is the controller's data record (the page
     * being rendered). Relation-item previews (e.g. a Product whose PreviewLink
     * points at its parent page) still render the page, so page scope is the
     * correct boot scope — the host narrows it when an item is being edited.
     */
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
        Requirements::customScript(
            'window.FluxFrameContext = ' . json_encode($context->jsonSerialize()) . ';'
                . 'window.FluxCsrf = ' . json_encode(SecurityToken::getSecurityID()) . ';'
                . 'window.FluxInlineEditorEnabled = ' . ($inlineEditorEnabled ? 'true' : 'false') . ';',
            'flux-frame-context',
        );
    }
}
