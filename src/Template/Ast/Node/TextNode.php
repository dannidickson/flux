<?php

namespace Flux\Template\Ast\Node;

use Flux\Template\Ast\Node;
use Flux\Template\Ast\NodeVisitor;

/**
 * A literal run of template source between tags. The engine never parses HTML structure
 * itself. The analyzer hands the reconstructed markup to DOMDocument only once
 * variables have been isolated.
 */
final class TextNode extends Node
{

    public function __construct(public readonly string $text, public readonly int $offset = 0)
    {
    }

    public function accept(NodeVisitor $visitor): mixed
    {
        return $visitor->visitText($this);
    }

}
