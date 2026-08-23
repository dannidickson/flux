<?php

namespace Flux\Template\Ast\Node;

use Flux\Template\Ast\BodyContainer;
use Flux\Template\Ast\Node;
use Flux\Template\Ast\NodeVisitor;

/**
 * Node for a custom tag produced by a {@see \Flux\Template\Parser\TagHandler}, e.g.
 * `<% island 'server-name' %>…<% end_island %>`. Implements {@see BodyContainer} so
 * its body is walked in the enclosing scope by default; subclass and implement
 * {@see \Flux\Template\Ast\ScopeOpener} instead to open a child scope.
 */
class ExtensionNode extends Node implements BodyContainer
{

    /**
     * @param array<int|string, mixed> $args Shape is the handler's choice.
     * @param Node[] $body Empty for a self-closing tag.
     */
    public function __construct(
        public readonly string $keyword,
        public readonly array $args = [],
        public readonly array $body = [],
    ) {
    }

    public function getBody(): array
    {
        return $this->body;
    }

    public function accept(NodeVisitor $visitor): mixed
    {
        return $visitor->visitExtension($this);
    }

}
