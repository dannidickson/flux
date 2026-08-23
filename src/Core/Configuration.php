<?php

namespace Flux\Core;

use SilverStripe\CMS\Model\RedirectorPage;
use SilverStripe\CMS\Model\VirtualPage;
use SilverStripe\Core\Config\Configurable;
use SilverStripe\Core\Injector\Injectable;
use SilverStripe\ErrorPage\ErrorPage;

class Configuration
{

    use Configurable;
    use Injectable;

    private static bool $enable_inline_editor = false;

    /**
     * By default this will enable Flux to workout of the box
     */
    private static bool $enable_auto_set_fields = true;

    /**
     * Classes to exclude from flux config generation and live updates.
     * e.g. RedirectorPage, ErrorPage
     *
     * @var string[]
     */
    private static array $excluded_classes = [
        RedirectorPage::class,
        ErrorPage::class,
        VirtualPage::class,
    ];

}
