<?php

namespace Flux\Template\Lexer;

/**
 * A lexical token. $value is the source text it covers, or a normalised form
 */
final class Token
{

    public readonly TokenType $type;

    public readonly string $value;

    public readonly int $offset;

    public function __construct(TokenType $type, string $value, int $offset)
    {
        $this->type = $type;
        $this->value = $value;
        $this->offset = $offset;
    }

    public function is(TokenType $type): bool
    {
        return $this->type === $type;
    }

    public function __toString(): string
    {
        return sprintf('%s(%s)', $this->type->value, $this->value);
    }

}
