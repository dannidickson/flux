<?php

namespace Flux\Forms;

use SilverStripe\Forms\GridField\GridField;
use SilverStripe\Forms\GridField\GridFieldDeleteAction;
use SilverStripe\ORM\DataObjectInterface;
use SilverStripe\View\ViewableData;

class FluxGridFieldDeleteAction extends GridFieldDeleteAction
{
    protected function getRemoveAction($gridField, $record, $columnName)
    {
        $field = parent::getRemoveAction($gridField, $record, $columnName);

        if ($field) {
            $field->setAttribute('fx-event', 'click');
        }

        return $field;
    }
}
