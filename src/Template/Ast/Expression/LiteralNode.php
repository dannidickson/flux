<?php

namespace Flux\Template\Ast\Expression;

use Flux\Template\Ast\NodeVisitor;

/**
 * A literal value in an expression, carrying its native PHP type. Analysis ignores these
 * but must still parse them so method-call argument lists don't derail.
 */
final class LiteralNode extends Expression
{

    public function __construct(public readonly string|int|float|bool $value)
    {
    }

    public function accept(NodeVisitor $visitor): mixed
    {
        return $visitor->visitLiteral($this);
    }

}
