<?php

namespace Flux\Template\Ast\Expression;

use Flux\Template\Ast\NodeVisitor;

/**
 * A negated condition expression: `not $X` or `!$X`.
 */
final class UnaryExpression extends Expression
{

    public function __construct(public readonly string $operator, public readonly Expression $operand)
    {
    }

    public function accept(NodeVisitor $visitor): mixed
    {
        return $visitor->visitUnary($this);
    }

}
