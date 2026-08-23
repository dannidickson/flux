<?php

namespace Flux\Template\Ast\Node;

use Flux\Template\Ast\Node;
use Flux\Template\Ast\NodeVisitor;

/**
 * A self-closing pass-through tag the analyzer ignores but must not choke on:
 * `<% require … %>`, `<% base_tag %>`, and other unrecognised single tags.
 */
final class RequireNode extends Node
{

    public function __construct(public readonly string $keyword, public readonly string $raw = '')
    {
    }

    public function accept(NodeVisitor $visitor): mixed
    {
        return $visitor->visitRequire($this);
    }

}
