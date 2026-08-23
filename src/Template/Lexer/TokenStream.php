<?php

namespace Flux\Template\Lexer;

use RuntimeException;

/**
 * A forward cursor over a token array produced by the {@see Lexer}. The array
 * always ends with an EOF token, which the cursor clamps at rather than
 * overrunning.
 */
final class TokenStream
{

    private int $index = 0;
    private readonly int $count;

    /** @var Token[] */
    private readonly array $tokens;

    /** @param Token[] $tokens */
    public function __construct(array $tokens)
    {
        $this->tokens = $tokens;
        $this->count = count($tokens);
    }

    public function current(): Token
    {
        return $this->tokens[min($this->index, $this->count - 1)];
    }

    public function peek(int $ahead = 1): Token
    {
        return $this->tokens[min($this->index + $ahead, $this->count - 1)];
    }

    /**
     * Return the current token and advance the cursor (clamped at EOF).
     */
    public function next(): Token
    {
        $token = $this->current();

        if ($this->index < $this->count - 1) {
            $this->index++;
        }

        return $token;
    }

    /**
     * Assert the current token's type, then consume and return it.
     */
    public function expect(TokenType $type): Token
    {
        $token = $this->current();

        if ($token->type !== $type) {
            throw new RuntimeException(sprintf(
                'Expected %s but got %s ("%s") at offset %d',
                $type->value,
                $token->type->value,
                $token->value,
                $token->offset,
            ));
        }

        return $this->next();
    }

    public function isEof(): bool
    {
        return $this->current()->type === TokenType::Eof;
    }

}
