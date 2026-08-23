<?php

namespace Flux\Tests\Template\Parser;

use Flux\Template\Ast\Expression\BinaryExpression;
use Flux\Template\Ast\Expression\Expression;
use Flux\Template\Ast\Expression\LiteralNode;
use Flux\Template\Ast\Expression\LookupNode;
use Flux\Template\Ast\Expression\MethodCall;
use Flux\Template\Ast\Expression\UnaryExpression;
use Flux\Template\Lexer\Lexer;
use Flux\Template\Lexer\Token;
use Flux\Template\Lexer\TokenStream;
use Flux\Template\Lexer\TokenType;
use Flux\Template\Parser\ExpressionParser;
use Flux\Template\Parser\Parser;
use PHPUnit\Framework\TestCase;

/**
 * The expression parser is framework-free (lexer → LookupNode), so this extends
 * PHPUnit's TestCase directly, with no SapphireTest / DB needed.
 */
class ExpressionParserTest extends TestCase
{

    private function parse(string $source): LookupNode
    {
        return (new ExpressionParser())->parse(Lexer::stream($source));
    }

    public function testBareVariable(): void
    {
        $node = $this->parse('$Title');

        $this->assertSame('Title', $node->name);
        $this->assertSame([], $node->accessors);
        $this->assertNull($node->args);
        $this->assertFalse($node->isCall());
        $this->assertSame(0, $node->scopeHops);
        $this->assertFalse($node->fromTop);
        $this->assertSame('Title', $node->fieldName());
    }

    public function testPropertyChain(): void
    {
        $node = $this->parse('$A.B.C');

        $this->assertSame('A', $node->name);
        $this->assertSame(['B', 'C'], $node->accessors);
    }

    public function testSinglePropertyAccess(): void
    {
        $node = $this->parse('$Image.URL');

        $this->assertSame('Image', $node->name);
        $this->assertSame(['URL'], $node->accessors);
    }

    public function testBracedVariable(): void
    {
        $node = $this->parse('{$Count}');

        $this->assertSame('Count', $node->name);
        $this->assertSame([], $node->accessors);
    }

    public function testBracedPropertyChain(): void
    {
        $node = $this->parse('{$Image.URL}');

        $this->assertSame('Image', $node->name);
        $this->assertSame(['URL'], $node->accessors);
    }

    public function testMethodCallWithNumericArg(): void
    {
        $node = $this->parse('$Menu(2)');

        $this->assertSame('Menu', $node->name);
        $this->assertTrue($node->isCall());
        $this->assertCount(1, $node->args);
        $this->assertInstanceOf(LiteralNode::class, $node->args[0]);
        $this->assertSame(2, $node->args[0]->value);
        $this->assertSame([], $node->accessors);
    }

    public function testMethodCallWithNoArgs(): void
    {
        $node = $this->parse('$Items()');

        $this->assertSame('Items', $node->name);
        $this->assertTrue($node->isCall());
        $this->assertSame([], $node->args);
    }

    public function testMethodCallWithMixedArgs(): void
    {
        $node = $this->parse("\$Field('x', \$Y)");

        $this->assertSame('Field', $node->name);
        $this->assertCount(2, $node->args);

        $this->assertInstanceOf(LiteralNode::class, $node->args[0]);
        $this->assertSame('x', $node->args[0]->value);

        $this->assertInstanceOf(LookupNode::class, $node->args[1]);
        $this->assertSame('Y', $node->args[1]->name);
    }

    public function testNestedVariableInArgument(): void
    {
        $node = $this->parse('$Field($Inner.Sub)');

        $this->assertSame('Field', $node->name);
        $this->assertCount(1, $node->args);

        $arg = $node->args[0];
        $this->assertInstanceOf(LookupNode::class, $arg);
        $this->assertSame('Inner', $arg->name);
        $this->assertSame(['Sub'], $arg->accessors);
    }

    public function testFloatAndBooleanLiteralArguments(): void
    {
        $node = $this->parse('$Calc(2.5, true, false)');

        $this->assertSame(2.5, $node->args[0]->value);
        $this->assertTrue($node->args[1]->value);
        $this->assertFalse($node->args[2]->value);
    }

    public function testChainedCallThenProperty(): void
    {
        $node = $this->parse('$Menu(1).First');

        $this->assertSame('Menu', $node->name);
        $this->assertCount(1, $node->args);
        $this->assertSame(1, $node->args[0]->value);
        $this->assertSame(['First'], $node->accessors);
    }

    public function testMethodCallAsAccessor(): void
    {
        $node = $this->parse('$Obj.Foo(1)');

        $this->assertSame('Obj', $node->name);
        $this->assertNull($node->args);
        $this->assertCount(1, $node->accessors);

        $accessor = $node->accessors[0];
        $this->assertInstanceOf(MethodCall::class, $accessor);
        $this->assertSame('Foo', $accessor->name);
        $this->assertSame(1, $accessor->args[0]->value);
    }

    public function testCastingSuffixIsKeptAsAccessor(): void
    {
        // The suffix is preserved verbatim; CastingSuffixes (Phase 4) strips it.
        $node = $this->parse('$Content.XML');

        $this->assertSame('Content', $node->name);
        $this->assertSame(['XML'], $node->accessors);
        $this->assertSame('Content', $node->fieldName());
    }

    public function testUpScopeHop(): void
    {
        $node = $this->parse('$Up.Title');

        $this->assertSame(1, $node->scopeHops);
        $this->assertFalse($node->fromTop);
        $this->assertSame('Title', $node->name);
        $this->assertSame([], $node->accessors);
    }

    public function testChainedUpScopeHops(): void
    {
        $node = $this->parse('$Up.Up.Name');

        $this->assertSame(2, $node->scopeHops);
        $this->assertSame('Name', $node->name);
    }

    public function testUpScopeHopWithFurtherChain(): void
    {
        $node = $this->parse('$Up.Author.Name');

        $this->assertSame(1, $node->scopeHops);
        $this->assertSame('Author', $node->name);
        $this->assertSame(['Name'], $node->accessors);
    }

    public function testTopScope(): void
    {
        $node = $this->parse('$Top.SiteConfig');

        $this->assertTrue($node->fromTop);
        $this->assertSame(0, $node->scopeHops);
        $this->assertSame('SiteConfig', $node->name);
    }

    public function testBareUpDegradesToName(): void
    {
        // No `.NAME` follows, so `Up` is treated as an ordinary field name.
        $node = $this->parse('$Up');

        $this->assertSame(0, $node->scopeHops);
        $this->assertSame('Up', $node->name);
    }

    public function testCursorStopsAfterExpression(): void
    {
        // The parser must leave the cursor on the token following the lookup so
        // the statement parser can continue mid-tag.
        $stream = Lexer::stream('$Items rest');
        (new ExpressionParser())->parse($stream);

        $this->assertTrue($stream->current()->is(TokenType::Text));
        $this->assertSame(' rest', $stream->current()->value);
    }

    public function testParseValueOnLiteralTokens(): void
    {
        // parseValue over a hand-built stream (literals don't appear bare in the
        // DATA state, only inside tags / argument lists).
        $stream = new TokenStream([
            new Token(TokenType::Number, '42', 0),
            new Token(TokenType::Eof, '', 2),
        ]);

        $value = (new ExpressionParser())->parseValue($stream);

        $this->assertInstanceOf(LiteralNode::class, $value);
        $this->assertSame(42, $value->value);
    }

    public function testParseValueOnVariable(): void
    {
        $value = (new ExpressionParser())->parseValue(Lexer::stream('$Foo.Bar'));

        $this->assertInstanceOf(LookupNode::class, $value);
        $this->assertSame('Foo', $value->name);
        $this->assertSame(['Bar'], $value->accessors);
    }

    /**
     * Conditions only tokenise as expressions inside a `<% ... %>` tag, so these route
     * through the real parser rather than feeding raw source to the lexer.
     */
    private function condition(string $source): Expression
    {
        $tree = Parser::parse('<% if ' . $source . ' %>x<% end_if %>');

        return $tree->children[0]->branches[0]->expression;
    }

    public function testConditionOfBareLookup(): void
    {
        $expression = $this->condition('$ShowTitle');

        $this->assertInstanceOf(LookupNode::class, $expression);
        $this->assertSame('ShowTitle', $expression->name);
    }

    public function testConditionAndOperator(): void
    {
        $expression = $this->condition('$A && $B');

        $this->assertInstanceOf(BinaryExpression::class, $expression);
        $this->assertSame('&&', $expression->operator);
        $this->assertSame('A', $expression->left->name);
        $this->assertSame('B', $expression->right->name);
    }

    public function testConditionOrOperator(): void
    {
        $expression = $this->condition('$A || $B');

        $this->assertInstanceOf(BinaryExpression::class, $expression);
        $this->assertSame('||', $expression->operator);
    }

    public function testConditionNotKeyword(): void
    {
        $expression = $this->condition('not $Hidden');

        $this->assertInstanceOf(UnaryExpression::class, $expression);
        $this->assertSame('not', $expression->operator);
        $this->assertSame('Hidden', $expression->operand->name);
    }

    public function testConditionBangOperator(): void
    {
        $expression = $this->condition('!$Hidden');

        $this->assertInstanceOf(UnaryExpression::class, $expression);
        $this->assertSame('!', $expression->operator);
    }

    public function testConditionComparisonAgainstLiteral(): void
    {
        $expression = $this->condition("\$Status == 'Live'");

        $this->assertInstanceOf(BinaryExpression::class, $expression);
        $this->assertSame('==', $expression->operator);
        $this->assertSame('Status', $expression->left->name);
        $this->assertInstanceOf(LiteralNode::class, $expression->right);
        $this->assertSame('Live', $expression->right->value);
    }

    public function testConditionMethodCall(): void
    {
        $expression = $this->condition('$Menu(2)');

        $this->assertInstanceOf(LookupNode::class, $expression);
        $this->assertTrue($expression->isCall());
        $this->assertSame('Menu', $expression->name);
    }

    public function testConditionScopeQualifiedLookup(): void
    {
        $expression = $this->condition('$Up.ShowTitle');

        $this->assertInstanceOf(LookupNode::class, $expression);
        $this->assertSame(1, $expression->scopeHops);
        $this->assertSame('ShowTitle', $expression->name);
    }

    public function testConditionParenthesesGroupPrecedence(): void
    {
        $expression = $this->condition('($A || $B) && $C');

        $this->assertInstanceOf(BinaryExpression::class, $expression);
        $this->assertSame('&&', $expression->operator);
        $this->assertInstanceOf(BinaryExpression::class, $expression->left);
        $this->assertSame('||', $expression->left->operator);
        $this->assertSame('C', $expression->right->name);
    }

    public function testConditionCombinesMultipleFields(): void
    {
        $expression = $this->condition('$ShowTitle && $HasContent');

        $this->assertInstanceOf(BinaryExpression::class, $expression);
        $this->assertSame('ShowTitle', $expression->left->name);
        $this->assertSame('HasContent', $expression->right->name);
    }

}
