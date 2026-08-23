<?php

namespace Flux\Template\Ast\Node;

use Flux\Template\Ast\BodyContainer;
use Flux\Template\Ast\Node;
use Flux\Template\Ast\NodeVisitor;

/**
 * A `<% cached … %> … <% end_cached %>` block. Caching doesn't affect field binding,
 * so the body folds into the enclosing scope.
 */
final class CachedNode extends Node implements BodyContainer
{

    /** @param Node[] $body */
    public function __construct(public readonly array $body = [], public readonly string $raw = '')
    {
    }

    public function getBody(): array
    {
        return $this->body;
    }

    public function accept(NodeVisitor $visitor): mixed
    {
        return $visitor->visitCached($this);
    }

}
