<?php

namespace Flux\Template\Ast\Expression;

use Flux\Template\Ast\NodeVisitor;

/**
 * A method-call accessor appearing after the base of a lookup chain, e.g. the
 * `Foo(1, $Bar)` in `$Obj.Foo(1, $Bar)`.
 */
final class MethodCall extends Expression
{

    /** @param Expression[] $args */
    public function __construct(public readonly string $name, public readonly array $args = [])
    {
    }

    public function accept(NodeVisitor $visitor): mixed
    {
        return $visitor->visitMethodCall($this);
    }

}
