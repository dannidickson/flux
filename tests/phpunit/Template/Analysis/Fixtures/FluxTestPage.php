<?php

namespace Flux\Tests\Template\Analysis\Fixtures;

use SilverStripe\Dev\TestOnly;
use SilverStripe\ORM\DataObject;

class FluxTestPage extends DataObject implements TestOnly
{

    private static string $table_name = 'FluxTestPage';

    private static array $db = [
        'Title' => 'Varchar',
        'Content' => 'HTMLText',
    ];

    private static array $has_one = [
        'Hero' => FluxTestImage::class,
    ];

    private static array $has_many = [
        'Blocks' => FluxTestBlock::class,
    ];

}
