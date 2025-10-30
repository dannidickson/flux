<?php

namespace Flux\Core;

use SilverStripe\Core\Config\Configurable;
use SilverStripe\Core\Injector\Injectable;

class Configuration
{
    use Configurable;
    use Injectable;

    private static bool $flux_components_enabled = true;
    private static bool $flux_live_updates_enabled = true;
}
