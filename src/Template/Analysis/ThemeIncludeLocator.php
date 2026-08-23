<?php

namespace Flux\Template\Analysis;

use SilverStripe\Core\Path;
use SilverStripe\View\SSViewer;
use SilverStripe\View\ThemeResourceLoader;

/**
 * Resolves an include name to `templates/Includes/{Name}.ss` across the active themes.
 */
final class ThemeIncludeLocator implements IncludeLocator
{

    public function load(string $name): ?string
    {
        $loader = ThemeResourceLoader::inst();
        $base = $loader->getBase();

        foreach ($loader->getThemePaths(SSViewer::get_themes()) as $themePath) {
            $path = Path::join($base, $themePath, 'templates', 'Includes', $name) . '.ss';

            if (!file_exists($path)) {
                continue;
            }

            $source = file_get_contents($path);

            if ($source === false) {
                return null;
            }

            return $source;
        }

        return null;
    }

}
