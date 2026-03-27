<?php

namespace Flux\Extension\Controller;

use SilverStripe\Core\Extension;

class GridFieldDetailFormControllerExtension extends Extension
{
    public function updateItemEditForm($form)
    {
        $actionSave = $form->Actions()->dataFieldByName('action_doSave');
        if ($actionSave) {
            $actionSave->setAttribute('fx-event', 'click');
        }

        $actionDelete = $form->Actions()->dataFieldByName('action_doDelete');
        if ($actionDelete) {
            $actionDelete->setAttribute('fx-event', 'click');
        }
    }
}
