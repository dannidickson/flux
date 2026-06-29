<?php

namespace Flux\Core;

use SilverStripe\Core\Config\Configurable;
use SilverStripe\Core\Injector\Injectable;

class Configuration
{
    use Configurable;
    use Injectable;

    private static bool $enable_inline_editor = false;

    /**
     * Classes to exclude from flux config generation and live updates.
     * e.g. RedirectorPage, ErrorPage — pages without meaningful templates.
     *
     * @var string[]
     */
    private static array $excluded_classes = [
        \SilverStripe\CMS\Model\RedirectorPage::class,
        \SilverStripe\ErrorPage\ErrorPage::class,
        \SilverStripe\CMS\Model\VirtualPage::class,
    ];
}
