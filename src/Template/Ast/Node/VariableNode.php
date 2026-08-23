<?php

namespace Flux\Template\Ast\Node;

use Flux\Template\Ast\Expression\LookupNode;
use Flux\Template\Ast\Node;
use Flux\Template\Ast\NodeVisitor;

/**
 * An *output* of a value: `$Title`, `$Image.URL`, `{$Count}`. The raw source span is
 * kept because the analyzer replaces it with a `<flux-var>` placeholder.
 */
final class VariableNode extends Node
{

    public function __construct(
        public readonly LookupNode $expression,
        public readonly string $raw,
        public readonly int $offset = 0,
    ) {
    }

    public function accept(NodeVisitor $visitor): mixed
    {
        return $visitor->visitVariable($this);
    }

}
