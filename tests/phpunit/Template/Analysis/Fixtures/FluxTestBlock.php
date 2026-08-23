<?php

namespace Flux\Tests\Template\Analysis\Fixtures;

use SilverStripe\Dev\TestOnly;
use SilverStripe\ORM\DataObject;

class FluxTestBlock extends DataObject implements TestOnly
{

    private static string $table_name = 'FluxTestBlock';

    private static array $db = [
        'Heading' => 'Varchar',
    ];

    private static array $has_one = [
        'Page' => FluxTestPage::class,
    ];

}
