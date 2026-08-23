<?php

namespace Flux\Tests\Template\Lexer;

use Flux\Template\Lexer\Lexer;
use Flux\Template\Lexer\Token;
use Flux\Template\Lexer\TokenType;
use PHPUnit\Framework\TestCase;

class LexerTest extends TestCase
{

    /**
     * Tokenise and flatten to "TYPE:value" strings
     *
     * @return string[]
     */
    private function lex(string $source): array
    {
        $lexer = new Lexer($source);

        return array_map(
            function (Token $t) {
                if ($t->type === TokenType::Eof) {
                    return 'EOF';
                }

                return sprintf('%s:%s', $t->type->value, $t->value);
            },
            $lexer->run(),
        );
    }

    public function testPlainTextIsASingleTextToken(): void
    {
        $expectedLexedOutput = [
            'TEXT:<h1>Hello</h1>',
            'EOF',
        ];

        $expectedInput = '<h1>Hello</h1>';

        $this->assertSame($expectedLexedOutput, $this->lex($expectedInput));
    }

    public function testEmptySourceIsJustEof(): void
    {
        $expectedLexedOutput = [
            'EOF',
        ];

        $expectedInput = '';

        $this->assertSame(
            $expectedLexedOutput,
            $this->lex($expectedInput)
        );
    }

    public function testBareVariableSplitsSurroundingText(): void
    {
        $expectedLexedOutput = [
            'TEXT:<h1>',
            'DOLLAR:$',
            'NAME:Title',
            'TEXT:</h1>',
            'EOF',
        ];

        $expectedInput = '<h1>$Title</h1>';

        $this->assertSame(
            $expectedLexedOutput,
            $this->lex($expectedInput)
        );
    }

    public function testPropertyChain(): void
    {

        $expectedLexedOutput = [
            'DOLLAR:$',
            'NAME:Image',
            'DOT:.',
            'NAME:URL',
            'EOF',
        ];

        $expectedInput = '$Image.URL';

        $this->assertSame(
            $expectedLexedOutput,
            $this->lex($expectedInput)
        );
    }

    public function testBracedVariable(): void
    {
        $expectedLexedOutput = [
            'TEXT:a ',
            'LBRACE:{',
            'DOLLAR:$',
            'NAME:Count',
            'RBRACE:}',
            'TEXT: b',
            'EOF',
        ];

        $expectedInput = 'a {$Count} b';

        $this->assertSame(
            $expectedLexedOutput,
            $this->lex($expectedInput)
        );
    }

    public function testMethodCallWithNumericArg(): void
    {
        $expectedLexedOutput = [
            'DOLLAR:$',
            'NAME:Menu',
            'LPAREN:(',
            'NUMBER:2',
            'RPAREN:)',
            'EOF',
        ];

        $expectedInput = '$Menu(2)';

        $this->assertSame(
            $expectedLexedOutput,
            $this->lex($expectedInput)
        );
    }

    public function testMethodCallWithMixedArgs(): void
    {
        $expectedLexedOutput = [
            'DOLLAR:$',
            'NAME:Field',
            'LPAREN:(',
            'STR:x',
            'COMMA:,',
            'DOLLAR:$',
            'NAME:Y',
            'RPAREN:)',
            'EOF',
        ];

        $expectedInput = "\$Field('x', \$Y)";

        $this->assertSame(
            $expectedLexedOutput,
            $this->lex($expectedInput)
        );
    }

    public function testChainedCallAndProperty(): void
    {
        $expectedLexedOutput = [
            'DOLLAR:$',
            'NAME:Menu',
            'LPAREN:(',
            'NUMBER:1',
            'RPAREN:)',
            'DOT:.',
            'NAME:First',
            'EOF',
        ];

        $expectedInput = '$Menu(1).First';

        $this->assertSame(
            $expectedLexedOutput,
            $this->lex($expectedInput)
        );
    }

    public function testDollarNotFollowedByNameStaysText(): void
    {
        $expectedLexedOutput = [
            'TEXT:price $5 and $(x)',
            'EOF',
        ];

        $expectedInput = 'price $5 and $(x)';

        $this->assertSame(
            $expectedLexedOutput,
            $this->lex($expectedInput)
        );
    }

    // $Up / $Top are keyword names to the lexer; the analyzer interprets them.
    public function testScopeTraversalIsPlainNames(): void
    {
        $expectedLexedOutput = [
            'DOLLAR:$',
            'NAME:Up',
            'DOT:.',
            'NAME:Title',
            'EOF',
        ];

        $expectedInput = '$Up.Title';

        $this->assertSame(
            $expectedLexedOutput,
            $this->lex($expectedInput)
        );
    }

    public function testLoopTag(): void
    {
        $expectedLexedOutput = [
            'TAG_OPEN:<%', 'NAME:loop', 'DOLLAR:$', 'NAME:Items', 'TAG_CLOSE:%>',
            'TEXT:x',
            'TAG_OPEN:<%', 'NAME:end_loop', 'TAG_CLOSE:%>',
            'EOF',
        ];

        $expectedInput = '<% loop $Items %>x<% end_loop %>';

        $this->assertSame(
            $expectedLexedOutput,
            $this->lex($expectedInput)
        );
    }

    public function testIncludeWithArguments(): void
    {
        $expectedLexedOutput = [
            'TAG_OPEN:<%', 'NAME:include', 'NAME:Card',
            'NAME:Title', 'EQUALS:=', 'DOLLAR:$', 'NAME:Name', 'COMMA:,',
            'NAME:Pos', 'EQUALS:=', 'NUMBER:2',
            'TAG_CLOSE:%>', 'EOF',
        ];

        $expectedInput = '<% include Card Title=$Name, Pos=2 %>';

        $this->assertSame(
            $expectedLexedOutput,
            $this->lex($expectedInput)
        );
    }

    public function testIfConditionOperators(): void
    {
        $expectedLexedOutput = [
            'TAG_OPEN:<%', 'NAME:if', 'DOLLAR:$', 'NAME:A', 'AND:&&',
            'DOLLAR:$', 'NAME:B', 'EQ:==', 'STR:x', 'TAG_CLOSE:%>', 'EOF',
        ];

        $expectedInput = "<% if \$A && \$B == 'x' %>";

        $this->assertSame(
            $expectedLexedOutput,
            $this->lex($expectedInput)
        );
    }

    public function testComment(): void
    {
        $expectedLexedOutput = [
            'TEXT:a',
            'COMMENT:hello there',
            'TEXT:b',
            'EOF',
        ];

        $expectedInput = 'a<%-- hello there --%>b';

        $this->assertSame(
            $expectedLexedOutput,
            $this->lex($expectedInput)
        );
    }

    public function testUnterminatedTag(): void
    {
        $expectedLexedOutput = [
            'TAG_OPEN:<%',
            'NAME:loop',
            'DOLLAR:$',
            'NAME:Items',
            'EOF',
        ];

        $expectedInput = '<% loop $Items';

        $this->assertSame(
            $expectedLexedOutput,
            $this->lex($expectedInput)
        );
    }

    /**
     * The lexer has no concept of a keyword: every tag identifier is a plain NAME token,
     * and only Parser::parseTag() tells them apart. Sweeps all of them for regressions.
     */
    public function testAllNamedKeywords(): void
    {
        $keywords = [
            'if', 'else_if', 'else', 'end_if',
            'loop', 'end_loop',
            'with', 'end_with',
            'include',
            'cached', 'cache', 'end_cached', 'end_cache',
            't',
        ];

        foreach ($keywords as $keyword) {
            $expectedLexedOutput = [
                'TAG_OPEN:<%',
                sprintf('NAME:%s', $keyword),
                'TAG_CLOSE:%>',
                'EOF',
            ];

            $expectedInput = sprintf('<%% %s %%>', $keyword);

            $this->assertSame(
                $expectedLexedOutput,
                $this->lex($expectedInput),
                sprintf('Keyword "%s" did not lex as expected', $keyword)
            );
        }
    }

    /**
     * `island` is a third-party tag, not a built-in. The lexer doesn't distinguish the two,
     * so it must lex exactly like any other named tag.
     */
    public function testCustomExtensionTagLexesLikeAnyOtherTag(): void
    {
        $expectedLexedOutput = [
            'TAG_OPEN:<%',
            'NAME:island',
            'STR:cart',
            'TAG_CLOSE:%>',
            'TEXT:x',
            'TAG_OPEN:<%',
            'NAME:end_island',
            'TAG_CLOSE:%>',
            'EOF',
        ];

        $expectedInput = "<% island 'cart' %>x<% end_island %>";

        $this->assertSame(
            $expectedLexedOutput,
            $this->lex($expectedInput)
        );
    }

    public function testTokensCarrySourceOffsets(): void
    {
        $tokens = (new Lexer('ab$Title'))->run();
        $this->assertSame(TokenType::Text, $tokens[0]->type);
        $this->assertSame(0, $tokens[0]->offset);
        $this->assertSame(TokenType::Dollar, $tokens[1]->type);
        $this->assertSame(2, $tokens[1]->offset);
        $this->assertSame(TokenType::Name, $tokens[2]->type);
        $this->assertSame(3, $tokens[2]->offset);
    }

}
