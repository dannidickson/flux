<?php

namespace Flux\Extension\Controller;

use SilverStripe\Core\Extension;

class LinkFieldControllerExtension extends Extension
{

    public function updateLinkForm(mixed $form, mixed $link, mixed $operation): void
    {
        $actionSave = $form->Actions()->dataFieldByName('action_save');

        if (!$actionSave) {
            return;
        }

        $actionSave->setAttribute('fx-event', 'click');
    }

}
