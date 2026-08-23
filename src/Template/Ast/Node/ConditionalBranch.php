<?php

namespace Flux\Template\Ast\Node;

use Flux\Template\Ast\Expression\Expression;
use Flux\Template\Ast\Node;

/**
 * One branch of an {@see IfNode}: the `if` itself or an `else_if`. A plain value object,
 * not an AST node, must pair a condition with the body it guards.
 */
final class ConditionalBranch
{

    /**
     * @param string $raw Raw source of the condition, kept for diagnostics.
     * @param Node[] $body
     */
    public function __construct(
        public readonly string $raw,
        public readonly Expression $expression,
        public readonly int $offset,
        public readonly array $body,
    ) {
    }

}
