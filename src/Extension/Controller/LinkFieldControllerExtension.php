<?php

namespace Flux\Extension\Controller;

use SilverStripe\Core\Extension;

class LinkFieldControllerExtension extends Extension
{
    public function updateLinkForm($form, $link, $operation)
    {
        $actionSave = $form->Actions()->dataFieldByName('action_save');
        $actionSave->setAttribute('fx-event', 'click');
    }
}
