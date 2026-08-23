<?php

namespace Flux\Template\Parser;

/**
 * A lookup of custom tag keyword → {@see TagHandler}, matched case-insensitively.
 * Pass one to the {@see Parser} to extend the template language.
 */
final class TagHandlerRegistry
{

    /** @var array<string, TagHandler> keyed by lower-cased keyword */
    private array $handlers = [];

    public function register(string $keyword, TagHandler $handler): self
    {
        $this->handlers[strtolower($keyword)] = $handler;

        return $this;
    }

    public function has(string $keyword): bool
    {
        return isset($this->handlers[strtolower($keyword)]);
    }

    public function get(string $keyword): ?TagHandler
    {
        return $this->handlers[strtolower($keyword)] ?? null;
    }

}
