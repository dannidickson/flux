<?php

namespace Flux\Tests\Template\Analysis\Fixtures;

use SilverStripe\Dev\TestOnly;
use SilverStripe\ORM\DataObject;

class FluxTestImage extends DataObject implements TestOnly
{

    private static string $table_name = 'FluxTestImage';

    private static array $db = [
        'Caption' => 'Varchar',
    ];

}
