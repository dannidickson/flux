<?php

namespace Flux\Forms;

use SilverStripe\Forms\FormAction;
use SilverStripe\Forms\GridField\GridFieldDeleteAction;

class FluxGridFieldDeleteAction extends GridFieldDeleteAction
{

    /**
     * @inheritDoc
     */
    protected function getRemoveAction($gridField, $record, $columnName): ?FormAction
    {
        $field = parent::getRemoveAction($gridField, $record, $columnName);

        if ($field) {
            $field->setAttribute('fx-event', 'click');
        }

        return $field;
    }

}
