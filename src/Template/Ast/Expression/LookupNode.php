<?php

namespace Flux\Template\Ast\Expression;

use Flux\Template\Ast\NodeVisitor;

/**
 * A variable lookup, covering every `$Var` output and relation.
 * Leading `Up`/`Top` keywords are folded out of $name into $scopeHops/$fromTop,
 * so `$Up.Title` has name = 'Title'.
 *
 * @phpstan-type Accessor string|MethodCall
 */
final class LookupNode extends Expression
{

    /**
     * @param Expression[]|null $args Base-call arguments, or null if the base is not a call.
     * @param array<int, string|MethodCall> $accessors Ordered accessors after the base.
     */
    public function __construct(
        public readonly string $name,
        public readonly ?array $args = null,
        public readonly array $accessors = [],
        public readonly int $scopeHops = 0,
        public readonly bool $fromTop = false,
    ) {
    }

    /**
     * The field name this lookup binds to, before casting-suffix stripping.
     */
    public function fieldName(): string
    {
        return $this->name;
    }

    /**
     * Whether the base is a method call (`$Menu(2)`) rather than a property or bare variable.
     */
    public function isCall(): bool
    {
        return $this->args !== null;
    }

    public function accept(NodeVisitor $visitor): mixed
    {
        return $visitor->visitLookup($this);
    }

}
