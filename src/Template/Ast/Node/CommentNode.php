<?php

namespace Flux\Template\Ast\Node;

use Flux\Template\Ast\Node;
use Flux\Template\Ast\NodeVisitor;

/**
 * A `<%-- ... --%>` template comment. Kept in the tree but ignored by analysis.
 */
final class CommentNode extends Node
{

    public function __construct(public readonly string $text)
    {
    }

    public function accept(NodeVisitor $visitor): mixed
    {
        return $visitor->visitComment($this);
    }

}
