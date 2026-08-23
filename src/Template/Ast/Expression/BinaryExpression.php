<?php

namespace Flux\Template\Ast\Expression;

use Flux\Template\Ast\NodeVisitor;

/**
 * A two-operand condition: `&&`, `||`, or a comparison. Analysis never evaluates these,
 * as it only walks the tree to collect the {@see LookupNode}s a condition references.
 */
final class BinaryExpression extends Expression
{

    public function __construct(
        public readonly string $operator,
        public readonly Expression $left,
        public readonly Expression $right,
    ) {
    }

    public function accept(NodeVisitor $visitor): mixed
    {
        return $visitor->visitBinary($this);
    }

}
