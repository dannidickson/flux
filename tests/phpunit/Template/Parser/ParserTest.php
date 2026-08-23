<?php

namespace Flux\Tests\Template\Parser;

use Flux\Template\Ast\Expression\LookupNode;
use Flux\Template\Ast\Node\CachedNode;
use Flux\Template\Ast\Node\CommentNode;
use Flux\Template\Ast\Node\I18nNode;
use Flux\Template\Ast\Node\IfNode;
use Flux\Template\Ast\Node\IncludeNode;
use Flux\Template\Ast\Node\LoopNode;
use Flux\Template\Ast\Node\RequireNode;
use Flux\Template\Ast\Node\TemplateNode;
use Flux\Template\Ast\Node\TextNode;
use Flux\Template\Ast\Node\VariableNode;
use Flux\Template\Ast\Node\WithNode;
use Flux\Template\Parser\Parser;
use PHPUnit\Framework\TestCase;

/**
 * The statement parser is framework-free (source → TemplateNode AST), so this
 * extends PHPUnit's TestCase directly, with no SapphireTest / DB needed.
 */
class ParserTest extends TestCase
{

    private function parse(string $source): TemplateNode
    {
        return Parser::parse($source);
    }

    public function testPlainTextIsASingleTextNode(): void
    {
        $tree = $this->parse('<h1>Hello</h1>');

        $this->assertCount(1, $tree->children);
        $this->assertInstanceOf(TextNode::class, $tree->children[0]);
        $this->assertSame('<h1>Hello</h1>', $tree->children[0]->text);
    }

    public function testEmptySourceIsAnEmptyTemplate(): void
    {
        $this->assertSame([], $this->parse('')->children);
    }

    public function testVariableSplitsSurroundingText(): void
    {
        $tree = $this->parse('<h1>$Title</h1>');

        $this->assertCount(3, $tree->children);
        $this->assertInstanceOf(TextNode::class, $tree->children[0]);
        $this->assertSame('<h1>', $tree->children[0]->text);

        $var = $tree->children[1];
        $this->assertInstanceOf(VariableNode::class, $var);
        $this->assertSame('Title', $var->expression->name);
        $this->assertSame('$Title', $var->raw);
        $this->assertSame(4, $var->offset);

        $this->assertInstanceOf(TextNode::class, $tree->children[2]);
        $this->assertSame('</h1>', $tree->children[2]->text);
    }

    public function testBracedVariableRawSpanIncludesBraces(): void
    {
        $tree = $this->parse('a {$Count} b');

        $var = $tree->children[1];
        $this->assertInstanceOf(VariableNode::class, $var);
        $this->assertSame('Count', $var->expression->name);
        $this->assertSame('{$Count}', $var->raw);
    }

    public function testPropertyChainVariableRawSpan(): void
    {
        $tree = $this->parse('$Image.URL end');

        $var = $tree->children[0];
        $this->assertInstanceOf(VariableNode::class, $var);
        $this->assertSame('Image', $var->expression->name);
        $this->assertSame(['URL'], $var->expression->accessors);
        $this->assertSame('$Image.URL', $var->raw);
    }

    public function testComment(): void
    {
        $tree = $this->parse('a<%-- hi --%>b');

        $this->assertInstanceOf(TextNode::class, $tree->children[0]);
        $this->assertInstanceOf(CommentNode::class, $tree->children[1]);
        $this->assertSame('hi', $tree->children[1]->text);
        $this->assertInstanceOf(TextNode::class, $tree->children[2]);
    }

    public function testLoop(): void
    {
        $tree = $this->parse('<% loop $Items %><li>$Title</li><% end_loop %>');

        $this->assertCount(1, $tree->children);
        $loop = $tree->children[0];
        $this->assertInstanceOf(LoopNode::class, $loop);
        $this->assertSame('Items', $loop->subject->name);

        // <li> · $Title · </li>
        $this->assertCount(3, $loop->body);
        $this->assertInstanceOf(TextNode::class, $loop->body[0]);
        $this->assertInstanceOf(VariableNode::class, $loop->body[1]);
        $this->assertSame('Title', $loop->body[1]->expression->name);
    }

    public function testWith(): void
    {
        $tree = $this->parse('<% with $Hero %>$Title<% end_with %>');

        $with = $tree->children[0];
        $this->assertInstanceOf(WithNode::class, $with);
        $this->assertSame('Hero', $with->subject->name);
        $this->assertCount(1, $with->body);
        $this->assertInstanceOf(VariableNode::class, $with->body[0]);
    }

    public function testLoopSubjectMayTraverseScope(): void
    {
        $tree = $this->parse('<% loop $Up.Items %>x<% end_loop %>');

        $loop = $tree->children[0];
        $this->assertInstanceOf(LoopNode::class, $loop);
        $this->assertInstanceOf(LookupNode::class, $loop->subject);
        $this->assertSame(1, $loop->subject->scopeHops);
        $this->assertSame('Items', $loop->subject->name);
    }

    public function testIfElseIfElse(): void
    {
        $tree = $this->parse(
            '<% if $A %>a<% else_if $B %>b<% else %>c<% end_if %>',
        );

        $if = $tree->children[0];
        $this->assertInstanceOf(IfNode::class, $if);

        $this->assertCount(2, $if->branches);
        $this->assertSame('$A', $if->branches[0]->raw);
        $this->assertInstanceOf(TextNode::class, $if->branches[0]->body[0]);
        $this->assertSame('a', $if->branches[0]->body[0]->text);

        $this->assertSame('$B', $if->branches[1]->raw);
        $this->assertSame('b', $if->branches[1]->body[0]->text);

        $this->assertCount(1, $if->elseBody);
        $this->assertSame('c', $if->elseBody[0]->text);
    }

    public function testIfWithoutElse(): void
    {
        $tree = $this->parse('<% if $ShowTitle %>$Title<% end_if %>');

        $if = $tree->children[0];
        $this->assertInstanceOf(IfNode::class, $if);
        $this->assertCount(1, $if->branches);
        $this->assertSame('$ShowTitle', $if->branches[0]->raw);
        $this->assertSame([], $if->elseBody);
        $this->assertInstanceOf(VariableNode::class, $if->branches[0]->body[0]);
    }

    public function testConditionKeepsOperatorsRaw(): void
    {
        $tree = $this->parse("<% if \$A && \$B == 'x' %>y<% end_if %>");

        $if = $tree->children[0];
        $this->assertInstanceOf(IfNode::class, $if);
        $this->assertSame("\$A && \$B == 'x'", $if->branches[0]->raw);
    }

    public function testIncludeWithoutArguments(): void
    {
        $tree = $this->parse('<% include Sidebar %>');

        $include = $tree->children[0];
        $this->assertInstanceOf(IncludeNode::class, $include);
        $this->assertSame('Sidebar', $include->template);
        $this->assertSame([], $include->args);
    }

    public function testIncludeWithArguments(): void
    {
        $tree = $this->parse('<% include Card Title=$Name, Pos=2 %>');

        $include = $tree->children[0];
        $this->assertInstanceOf(IncludeNode::class, $include);
        $this->assertSame('Card', $include->template);
        $this->assertSame(['Title', 'Pos'], array_keys($include->args));

        $this->assertInstanceOf(LookupNode::class, $include->args['Title']);
        $this->assertSame('Name', $include->args['Title']->name);
        $this->assertSame(2, $include->args['Pos']->value);
    }

    public function testNestedBlocks(): void
    {
        $tree = $this->parse(
            '<% loop $Items %><% if $Featured %>$Title<% end_if %><% end_loop %>',
        );

        $loop = $tree->children[0];
        $this->assertInstanceOf(LoopNode::class, $loop);
        $this->assertCount(1, $loop->body);

        $if = $loop->body[0];
        $this->assertInstanceOf(IfNode::class, $if);
        $this->assertSame('Featured', trim($if->branches[0]->raw, '$'));

        $var = $if->branches[0]->body[0];
        $this->assertInstanceOf(VariableNode::class, $var);
        $this->assertSame('Title', $var->expression->name);
    }

    public function testRequireTagIsPassThrough(): void
    {
        $tree = $this->parse('<% require css("app.css") %>');

        $require = $tree->children[0];
        $this->assertInstanceOf(RequireNode::class, $require);
        $this->assertSame('require', $require->keyword);
        $this->assertSame('css("app.css")', $require->raw);
    }

    public function testBaseTagIsPassThroughRequireNode(): void
    {
        $tree = $this->parse('<head><% base_tag %></head>');

        $require = $tree->children[1];
        $this->assertInstanceOf(RequireNode::class, $require);
        $this->assertSame('base_tag', $require->keyword);
    }

    public function testCachedBlockWrapsItsBody(): void
    {
        $tree = $this->parse('<% cached $ID %>$Title<% end_cached %>');

        $cached = $tree->children[0];
        $this->assertInstanceOf(CachedNode::class, $cached);
        $this->assertSame('$ID', $cached->raw);
        $this->assertCount(1, $cached->body);
        $this->assertInstanceOf(VariableNode::class, $cached->body[0]);
    }

    public function testI18nTagIsPassThrough(): void
    {
        $tree = $this->parse("<%t Page.TITLE 'Default' %>");

        $i18n = $tree->children[0];
        $this->assertInstanceOf(I18nNode::class, $i18n);
        $this->assertSame("Page.TITLE 'Default'", $i18n->raw);
    }

    public function testUnterminatedLoopDegradesGracefully(): void
    {
        // No <% end_loop %>: should not loop forever or throw.
        $tree = $this->parse('<% loop $Items %>$Title');

        $loop = $tree->children[0];
        $this->assertInstanceOf(LoopNode::class, $loop);
        $this->assertInstanceOf(VariableNode::class, $loop->body[0]);
    }

}
