<?php

namespace Flux\Template\Analysis;

use Flux\Template\Ast\Expression\BinaryExpression;
use Flux\Template\Ast\Expression\Expression;
use Flux\Template\Ast\Expression\LookupNode;
use Flux\Template\Ast\Expression\MethodCall;
use Flux\Template\Ast\Expression\UnaryExpression;

/** Collects every {@see LookupNode} a condition expression references, including call args and accessor chains. */
final class LookupCollector
{

    /** @return LookupNode[] */
    public static function collect(Expression $expression): array
    {
        $lookups = [];
        self::walk($expression, $lookups);

        return $lookups;
    }

    /** @param LookupNode[] $lookups */
    private static function walk(Expression $expression, array &$lookups): void
    {
        if ($expression instanceof LookupNode) {
            self::walkLookup($expression, $lookups);

            return;
        }

        if ($expression instanceof BinaryExpression) {
            self::walk($expression->left, $lookups);
            self::walk($expression->right, $lookups);

            return;
        }

        if (!($expression instanceof UnaryExpression)) {
            return;
        }

        self::walk($expression->operand, $lookups);
    }

    /** @param LookupNode[] $lookups */
    private static function walkLookup(LookupNode $lookup, array &$lookups): void
    {
        $lookups[] = $lookup;

        foreach ($lookup->args ?? [] as $arg) {
            self::walk($arg, $lookups);
        }

        foreach ($lookup->accessors as $accessor) {
            if (!($accessor instanceof MethodCall)) {
                continue;
            }

            foreach ($accessor->args as $arg) {
                self::walk($arg, $lookups);
            }
        }
    }

}
