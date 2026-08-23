<?php

namespace Flux\Template\Ast\Node;

use Flux\Template\Ast\Node;
use Flux\Template\Ast\NodeVisitor;

/**
 * A conditional block: `<% if %>` plus any `<% else_if %>` branches and an optional
 * `<% else %>` body. Analysis visits every branch control flow
 */
final class IfNode extends Node
{

    public function __construct(public readonly array $branches, public readonly array $elseBody = [])
    {
    }

    public function accept(NodeVisitor $visitor): mixed
    {
        return $visitor->visitIf($this);
    }

}
