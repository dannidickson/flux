<?php

namespace Flux\Extension\Controller;

use SilverStripe\Core\Extension;
use SilverStripe\Forms\Form;

class GridFieldDetailFormControllerExtension extends Extension
{

    public function updateItemEditForm(Form $form): void
    {
        $actionSave = $form->Actions()->dataFieldByName('action_doSave');

        if ($actionSave) {
            $actionSave->setAttribute('fx-event', 'click');
        }

        $actionDelete = $form->Actions()->dataFieldByName('action_doDelete');

        if (!$actionDelete) {
            return;
        }

        $actionDelete->setAttribute('fx-event', 'click');
    }

}
