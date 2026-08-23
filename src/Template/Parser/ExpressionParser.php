<?php

namespace Flux\Template\Parser;

use Flux\Template\Ast\Expression\BinaryExpression;
use Flux\Template\Ast\Expression\Expression;
use Flux\Template\Ast\Expression\LiteralNode;
use Flux\Template\Ast\Expression\LookupNode;
use Flux\Template\Ast\Expression\MethodCall;
use Flux\Template\Ast\Expression\UnaryExpression;
use Flux\Template\Lexer\TokenStream;
use Flux\Template\Lexer\TokenType;
use RuntimeException;

/**
 * Parses a variable expression out of a {@see TokenStream} into a
 * {@see LookupNode}. Consumes exactly one expression's tokens and leaves the
 * cursor on the token that follows, so the statement parser can call it mid-tag.
 *
 * Grammar (informal):
 *
 *   variable := '{' lookup '}' | lookup
 *   lookup := '$' scope? NAME callArgs? accessor*
 *   scope := ( 'Up' '.' )+ | 'Top' '.'
 *   accessor := '.' NAME callArgs?
 *   callArgs := '(' ( value ( ',' value )* )? ')'
 *   value := lookup | STRING | NUMBER | 'true' | 'false'
 */
final class ExpressionParser
{

    private TokenStream $stream;

    /**
     * Parse a variable output: a `$Var` / `$A.B.C` / `$Method(…)`, optionally
     * wrapped in `{ … }` as `{$Var}`.
     */
    public function parse(TokenStream $stream): LookupNode
    {
        $this->stream = $stream;

        $braced = $this->stream->current()->is(TokenType::LBrace);

        if ($braced) {
            $this->stream->next();
        }

        $lookup = $this->parseLookup();

        if ($braced && $this->stream->current()->is(TokenType::RBrace)) {
            $this->stream->next();
        }

        return $lookup;
    }

    /**
     * Parse any expression *value*: a nested variable or a literal. Used for
     * method-call arguments and (later) include arguments and conditions.
     */
    public function parseValue(TokenStream $stream): Expression
    {
        $this->stream = $stream;

        return $this->parseExpression();
    }

    /** Parse an `<% if %>`/`<% else_if %>` condition: `||`, `&&`, `not`/`!`, comparisons, over lookups and literals. */
    public function parseCondition(TokenStream $stream): Expression
    {
        $this->stream = $stream;

        return $this->parseOr();
    }

    private function parseOr(): Expression
    {
        $left = $this->parseAnd();

        while ($this->stream->current()->is(TokenType::Or)) {
            $this->stream->next();
            $left = new BinaryExpression('||', $left, $this->parseAnd());
        }

        return $left;
    }

    private function parseAnd(): Expression
    {
        $left = $this->parseNot();

        while ($this->stream->current()->is(TokenType::And)) {
            $this->stream->next();
            $left = new BinaryExpression('&&', $left, $this->parseNot());
        }

        return $left;
    }

    private function parseNot(): Expression
    {
        if ($this->stream->current()->is(TokenType::Not)) {
            $this->stream->next();

            return new UnaryExpression('!', $this->parseNot());
        }

        if ($this->isNotKeyword()) {
            $this->stream->next();

            return new UnaryExpression('not', $this->parseNot());
        }

        return $this->parseComparison();
    }

    /** `not` is a bare NAME token, not a dedicated operator token. */
    private function isNotKeyword(): bool
    {
        $token = $this->stream->current();

        return $token->is(TokenType::Name) && strtolower($token->value) === 'not';
    }

    private const array COMPARISON_OPERATORS = [
        TokenType::Eq->value => '==',
        TokenType::Neq->value => '!=',
        TokenType::Lte->value => '<=',
        TokenType::Gte->value => '>=',
        TokenType::Lt->value => '<',
        TokenType::Gt->value => '>',
    ];

    private function parseComparison(): Expression
    {
        $left = $this->parseConditionOperand();

        $operator = self::COMPARISON_OPERATORS[$this->stream->current()->type->value] ?? null;

        if ($operator === null) {
            return $left;
        }

        $this->stream->next();

        return new BinaryExpression($operator, $left, $this->parseConditionOperand());
    }

    /** A parenthesised sub-expression, or a plain lookup/literal value. */
    private function parseConditionOperand(): Expression
    {
        if ($this->stream->current()->is(TokenType::LParen)) {
            $this->stream->next();
            $expression = $this->parseOr();

            if ($this->stream->current()->is(TokenType::RParen)) {
                $this->stream->next();
            }

            return $expression;
        }

        return $this->parseExpression();
    }

    private function parseLookup(): LookupNode
    {
        $this->stream->expect(TokenType::Dollar);

        [$name, $scopeHops, $fromTop] = $this->parseScopeAndBase();

        $args = null;

        if ($this->stream->current()->is(TokenType::LParen)) {
            $args = $this->parseArgs();
        }

        $accessors = [];

        while ($this->stream->current()->is(TokenType::Dot)) {
            $this->stream->next();
            $accName = $this->stream->expect(TokenType::Name)->value;

            if ($this->stream->current()->is(TokenType::LParen)) {
                $accessors[] = new MethodCall($accName, $this->parseArgs());

                continue;
            }

            $accessors[] = $accName;
        }

        return new LookupNode($name, $args, $accessors, $scopeHops, $fromTop);
    }

    /**
     * Consumes leading `Up.`/`Top.` keywords then the base name, as `[name, hops, fromTop]`.
     * A keyword only counts as scope when followed by `.NAME`, so a bare `$Up` stays a name.
     */
    private function parseScopeAndBase(): array
    {
        $scopeHops = 0;
        $fromTop = false;

        while ($this->stream->current()->value === 'Up' && $this->followedByDotName()) {
            $this->stream->next(); // Up
            $this->stream->next(); // .
            $scopeHops++;
        }

        if ($scopeHops === 0 && $this->stream->current()->value === 'Top' && $this->followedByDotName()) {
            $this->stream->next(); // Top
            $this->stream->next(); // .
            $fromTop = true;
        }

        $name = $this->stream->expect(TokenType::Name)->value;

        return [$name, $scopeHops, $fromTop];
    }

    /**
     * True when the current NAME token is immediately followed by `.NAME`,
     * i.e. it is a scope keyword prefixing a further lookup segment.
     */
    private function followedByDotName(): bool
    {
        return $this->stream->current()->is(TokenType::Name)
            && $this->stream->peek(1)->is(TokenType::Dot)
            && $this->stream->peek(2)->is(TokenType::Name);
    }

    /**
     * @return Expression[]
     */
    private function parseArgs(): array
    {
        $this->stream->expect(TokenType::LParen);

        $args = [];

        if (!$this->stream->current()->is(TokenType::RParen)) {
            $args[] = $this->parseExpression();

            while ($this->stream->current()->is(TokenType::Comma)) {
                $this->stream->next();
                $args[] = $this->parseExpression();
            }
        }

        $this->stream->expect(TokenType::RParen);

        return $args;
    }

    private function parseExpression(): Expression
    {
        $token = $this->stream->current();

        return match ($token->type) {
            TokenType::Dollar => $this->parseLookup(),
            TokenType::Str => $this->literal($this->stream->next()->value),
            TokenType::Number => $this->literal($this->numberValue($this->stream->next()->value)),
            TokenType::Name => $this->literal($this->nameValue($this->stream->next()->value)),
            default => throw new RuntimeException(sprintf(
                'Unexpected %s ("%s") at offset %d while parsing an expression',
                $token->type->value,
                $token->value,
                $token->offset,
            )),
        };
    }

    private function literal(string|int|float|bool $value): LiteralNode
    {
        return new LiteralNode($value);
    }

    private function numberValue(string $raw): int|float
    {
        if (str_contains($raw, '.')) {
            return (float) $raw;
        }

        return (int) $raw;
    }

    /**
     * A bare name inside an argument list is either a boolean keyword or, being
     * forgiving, a string literal (some templates pass unquoted words).
     */
    private function nameValue(string $raw): string|bool
    {
        return match (strtolower($raw)) {
            'true' => true,
            'false' => false,
            default => $raw,
        };
    }

}
