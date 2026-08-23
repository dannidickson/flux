<?php

namespace Flux\Template\Ast\Node;

use Flux\Template\Ast\Node;
use Flux\Template\Ast\NodeVisitor;

/**
 * Root of a parsed template: its child nodes in source order.
 */
final class TemplateNode extends Node
{

    /** @param Node[] $children */
    public function __construct(public readonly array $children = [])
    {
    }

    public function accept(NodeVisitor $visitor): mixed
    {
        return $visitor->visitTemplate($this);
    }

}
