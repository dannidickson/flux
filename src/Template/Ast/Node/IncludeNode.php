<?php

namespace Flux\Template\Ast\Node;

use Flux\Template\Ast\Expression\Expression;
use Flux\Template\Ast\Node;
use Flux\Template\Ast\NodeVisitor;

/**
 * An `<% include Template Arg=$Value %>`: stitches the template in, with optional
 * named arguments bound into its scope (@see `Analysis\IncludeResolver`).
 */
final class IncludeNode extends Node
{

    /** @param array<string, Expression> $args Named arguments, key => value expression. */
    public function __construct(public readonly string $template, public readonly array $args = [])
    {
    }

    public function accept(NodeVisitor $visitor): mixed
    {
        return $visitor->visitInclude($this);
    }

}
