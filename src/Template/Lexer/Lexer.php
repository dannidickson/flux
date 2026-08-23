<?php

namespace Flux\Template\Lexer;

/**
 * Tokenises a `.ss` template into a flat {@see Token} stream. Literal HTML stays opaque
 * text; only variables, tags and comments are structured. Deliberately forgiving an
 * unterminated tag is handled rather than thrown on.
 */
final class Lexer
{

    private int $pos = 0;
    private readonly int $length;

    /** @var Token[] */
    private array $tokens = [];

    private readonly string $source;

    public function __construct(string $source)
    {
        $this->source = $source;
        $this->length = strlen($source);
    }

    /**
     * Tokenise straight into a {@see TokenStream}.
     */
    public static function stream(string $source): TokenStream
    {
        return new TokenStream((new self($source))->run());
    }

    /**
     * @return Token[] always terminated by a single EOF token
     */
    public function run(): array
    {
        $this->scan();
        $this->push(TokenType::Eof, '', $this->pos);

        return $this->tokens;
    }

    private function scan(): void
    {
        $start = $this->pos;

        while ($this->pos < $this->length) {
            if ($this->matches('<%--')) {
                $this->flushText($start);
                $this->scanComment();
                $start = $this->pos;
            } elseif ($this->matches('<%')) {
                $this->flushText($start);
                $this->scanTag();
                $start = $this->pos;
            } elseif ($this->isBracedVarStart()) {
                $this->flushText($start);
                $this->scanBracedVariable();
                $start = $this->pos;
            } elseif ($this->isBareVarStart()) {
                $this->flushText($start);
                $this->scanVariable();
                $start = $this->pos;
            } else {
                $this->pos++;
            }
        }

        $this->flushText($start);
    }

    private function flushText(int $start): void
    {
        if ($this->pos <= $start) {
            return;
        }

        $this->push(TokenType::Text, substr($this->source, $start, $this->pos - $start), $start);
    }

    private function scanComment(): void
    {
        $start = $this->pos;
        $this->pos += 4; // <%--

        $end = strpos($this->source, '--%>', $this->pos);

        if ($end === false) {
            $inner = substr($this->source, $this->pos);
            $this->pos = $this->length;
        } else {
            $inner = substr($this->source, $this->pos, $end - $this->pos);
            $this->pos = $end + 4;
        }

        $this->push(TokenType::Comment, trim($inner), $start);
    }

    private function scanTag(): void
    {
        $this->push(TokenType::TagOpen, '<%', $this->pos);
        $this->pos += 2;

        while ($this->pos < $this->length) {
            $this->skipWhitespace();

            if ($this->pos >= $this->length) {
                return;
            }

            if ($this->matches('%>')) {
                $this->push(TokenType::TagClose, '%>', $this->pos);
                $this->pos += 2;

                return;
            }

            $this->scanExprToken();
        }
    }

    private function scanVariable(): void
    {
        $this->push(TokenType::Dollar, '$', $this->pos);
        $this->pos++; // $
        $this->scanLookupChain();
    }

    private function scanBracedVariable(): void
    {
        $this->push(TokenType::LBrace, '{', $this->pos);
        $this->pos++; // {
        $this->push(TokenType::Dollar, '$', $this->pos);
        $this->pos++; // $
        $this->scanLookupChain();

        if ($this->currentChar() !== '}') {
            return;
        }

        $this->push(TokenType::RBrace, '}', $this->pos);
        $this->pos++;
    }

    /**
     * A variable lookup: NAME ( '.' NAME | '(' args ')' )*.
     * Reads only as far as the chain extends, then returns control to DATA.
     */
    private function scanLookupChain(): void
    {
        if (!$this->isNameStart($this->currentChar())) {
            return;
        }

        $this->scanName();

        while ($this->pos < $this->length) {
            $char = $this->source[$this->pos];

            if ($char === '.' && $this->isNameStart($this->peekAt($this->pos + 1))) {
                $this->push(TokenType::Dot, '.', $this->pos);
                $this->pos++;
                $this->scanName();

                continue;
            }

            if ($char === '(') {
                $this->scanCallArgs();

                continue;
            }

            break;
        }
    }

    /**
     * A parenthesised argument list, tracking nesting depth so nested calls
     * and `$Var(...)` arguments don't terminate it early.
     */
    private function scanCallArgs(): void
    {
        $this->push(TokenType::LParen, '(', $this->pos);
        $this->pos++;
        $depth = 1;

        while ($this->pos < $this->length && $depth > 0) {
            $this->skipWhitespace();

            if ($this->pos >= $this->length) {
                return;
            }

            $char = $this->source[$this->pos];

            if ($char === '(') {
                $depth++;
                $this->push(TokenType::LParen, '(', $this->pos);
                $this->pos++;
            } elseif ($char === ')') {
                $depth--;
                $this->push(TokenType::RParen, ')', $this->pos);
                $this->pos++;
            } else {
                $this->scanExprToken();
            }
        }
    }

    /**
     * Scan a single token inside a tag or argument list: operators, punctuation,
     * literals, names and the `$` sigil. Always advances the cursor.
     */
    private const array TWO_CHAR_OPS = [
        '==' => TokenType::Eq,
        '!=' => TokenType::Neq,
        '<=' => TokenType::Lte,
        '>=' => TokenType::Gte,
        '&&' => TokenType::And,
        '||' => TokenType::Or,
    ];

    private const array SINGLE_CHAR_TOKENS = [
        '$' => TokenType::Dollar,
        '.' => TokenType::Dot,
        '(' => TokenType::LParen,
        ')' => TokenType::RParen,
        ',' => TokenType::Comma,
        '=' => TokenType::Equals,
        '<' => TokenType::Lt,
        '>' => TokenType::Gt,
        '!' => TokenType::Not,
        '}' => TokenType::RBrace,
    ];

    private function scanExprToken(): void
    {
        $start = $this->pos;

        $two = substr($this->source, $this->pos, 2);

        if (isset(self::TWO_CHAR_OPS[$two])) {
            $this->push(self::TWO_CHAR_OPS[$two], $two, $start);
            $this->pos += 2;

            return;
        }

        $char = $this->source[$this->pos];

        if (isset(self::SINGLE_CHAR_TOKENS[$char])) {
            $this->push(self::SINGLE_CHAR_TOKENS[$char], $char, $start);
            $this->pos++;

            return;
        }

        if ($char === '"' || $char === "'") {
            $this->scanString($char);

            return;
        }

        if (ctype_digit($char)) {
            $this->scanNumber();

            return;
        }

        if ($this->isNameStart($char)) {
            $this->scanName();

            return;
        }

        // Unknown character: skip it to stay robust.
        $this->pos++;
    }

    private function scanString(string $quote): void
    {
        $start = $this->pos;
        $this->pos++; // opening quote
        $value = '';

        while ($this->pos < $this->length) {
            $char = $this->source[$this->pos];

            if ($char === '\\' && $this->pos + 1 < $this->length) {
                $value .= $this->source[$this->pos + 1];
                $this->pos += 2;

                continue;
            }

            if ($char === $quote) {
                $this->pos++;

                break;
            }

            $value .= $char;
            $this->pos++;
        }

        $this->push(TokenType::Str, $value, $start);
    }

    private function scanNumber(): void
    {
        $start = $this->pos;

        while ($this->pos < $this->length && ctype_digit($this->source[$this->pos])) {
            $this->pos++;
        }

        // A single decimal point, only if followed by more digits (so a
        // property access like $List.First is never swallowed as a number).
        if ($this->currentChar() === '.' && ctype_digit($this->peekAt($this->pos + 1))) {
            $this->pos++;

            while ($this->pos < $this->length && ctype_digit($this->source[$this->pos])) {
                $this->pos++;
            }
        }

        $this->push(TokenType::Number, substr($this->source, $start, $this->pos - $start), $start);
    }

    private function scanName(): void
    {
        $start = $this->pos;

        while ($this->pos < $this->length && $this->isNameChar($this->source[$this->pos])) {
            $this->pos++;
        }

        $this->push(TokenType::Name, substr($this->source, $start, $this->pos - $start), $start);
    }

    private function skipWhitespace(): void
    {
        while ($this->pos < $this->length && ctype_space($this->source[$this->pos])) {
            $this->pos++;
        }
    }

    private function matches(string $needle): bool
    {
        return substr($this->source, $this->pos, strlen($needle)) === $needle;
    }

    private function currentChar(): string
    {
        if ($this->pos >= $this->length) {
            return '';
        }

        return $this->source[$this->pos];
    }

    private function peekAt(int $index): string
    {
        if ($index < 0 || $index >= $this->length) {
            return '';
        }

        return $this->source[$index];
    }

    private function isBareVarStart(): bool
    {
        return $this->currentChar() === '$' && $this->isNameStart($this->peekAt($this->pos + 1));
    }

    private function isBracedVarStart(): bool
    {
        return $this->currentChar() === '{'
            && $this->peekAt($this->pos + 1) === '$'
            && $this->isNameStart($this->peekAt($this->pos + 2));
    }

    private function isNameStart(string $char): bool
    {
        return $char !== '' && (ctype_alpha($char) || $char === '_');
    }

    private function isNameChar(string $char): bool
    {
        return $char !== '' && (ctype_alnum($char) || $char === '_');
    }

    private function push(TokenType $type, string $value, int $offset): void
    {
        $this->tokens[] = new Token($type, $value, $offset);
    }

}
