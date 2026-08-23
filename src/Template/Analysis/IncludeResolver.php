<?php

namespace Flux\Template\Analysis;

use Flux\Template\Ast\Node\TemplateNode;
use Flux\Template\Parser\Parser;
use Flux\Template\Parser\TagHandlerRegistry;

/**
 * Locates an include by name and parses it to the AST.
 * Effectively memoising it as a partial. To share across any instances in a single run.
 * Rather than checking each occurance.
 *
 * This will also respect the {@see TagHandlerRegistry} for custom tags. But ignore this
 */
final class IncludeResolver
{

    /** @var array<string, TemplateNode|null> */
    private array $cache = [];

    private readonly IncludeLocator $locator;

    private readonly ?TagHandlerRegistry $tags;

    public function __construct(IncludeLocator $locator, ?TagHandlerRegistry $tags = null)
    {
        $this->locator = $locator;
        $this->tags = $tags;
    }

    public function resolve(string $name): ?TemplateNode
    {
        if (array_key_exists($name, $this->cache)) {
            return $this->cache[$name];
        }

        $source = $this->locator->load($name);
        $tree = null;

        if ($source !== null) {
            $tree = Parser::parse($source, $this->tags);
        }

        return $this->cache[$name] = $tree;
    }

}
