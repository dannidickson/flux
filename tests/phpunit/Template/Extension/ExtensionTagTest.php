<?php

namespace Flux\Tests\Template\Extension;

use Flux\Template\Analysis\FieldBinding;
use Flux\Template\Analysis\TemplateAnalyzer;
use Flux\Template\Ast\Node\ExtensionNode;
use Flux\Template\Ast\Node\LoopNode;
use Flux\Template\Ast\Node\TextNode;
use Flux\Template\Ast\Node\VariableNode;
use Flux\Template\Parser\Parser;
use Flux\Template\Parser\TagHandlerRegistry;
use Flux\Tests\Template\Analysis\ArraySchemaInspector;
use PHPUnit\Framework\TestCase;

/**
 * Proves the template language is extensible from outside `src/`: a third-party
 * {@see IslandTagHandler} adds `<% island %>` with no core changes.
 *
 * @todo @ignore
 */
class ExtensionTagTest extends TestCase
{

    private function registry(): TagHandlerRegistry
    {
        return (new TagHandlerRegistry())->register('island', new IslandTagHandler());
    }

    public function testCustomBlockTagParsesToExtensionNode(): void
    {
        $tree = Parser::parse(
            '<% island \'cart\' %><div class="c">$Content</div><% end_island %>',
            $this->registry(),
        );

        $this->assertCount(1, $tree->children);
        $island = $tree->children[0];
        $this->assertInstanceOf(ExtensionNode::class, $island);
        $this->assertSame('island', $island->keyword);
        $this->assertSame('cart', $island->args['server']);

        // The body was parsed as ordinary template nodes (text · variable · text).
        $this->assertInstanceOf(TextNode::class, $island->body[0]);
        $this->assertSame('<div class="c">', $island->body[0]->text);
        $this->assertInstanceOf(VariableNode::class, $island->body[1]);
        $this->assertSame('Content', $island->body[1]->expression->name);
    }

    public function testUnregisteredTagStillFallsBackToPassThrough(): void
    {
        // No handler registered for `island` here → pass-through, no crash.
        $tree = Parser::parse("<% island 'cart' %>x<% end_island %>");

        $this->assertNotEmpty($tree->children);
    }

    public function testBuiltInTagsCannotBeOverridden(): void
    {
        $registry = (new TagHandlerRegistry())->register('loop', new IslandTagHandler());

        $tree = Parser::parse('<% loop $Items %>x<% end_loop %>', $registry);

        // `loop` is still the built-in construct, not the custom handler.
        $this->assertInstanceOf(LoopNode::class, $tree->children[0]);
    }

    public function testExtensionNodeBodyIsAnalysedInCurrentScope(): void
    {
        $tree = Parser::parse(
            '<% island \'cart\' %><div class="c">$Content</div><% end_island %>',
            $this->registry(),
        );

        $analyzer = TemplateAnalyzer::fromInspector(new ArraySchemaInspector([
            'Page' => ['db' => ['Content' => 'HTMLText']],
        ]));
        $result = $analyzer->analyze($tree, 'Page');

        // The field inside the custom block is discovered as a normal page field.
        $binding = null;

        foreach ($result->bindings as $b) {
            if ($b->field !== 'Content' || $b->scope !== FieldBinding::SCOPE_PAGE) {
                continue;
            }

            $binding = $b;
        }

        $this->assertNotNull($binding);
        $this->assertSame('.c', $binding->selector);
    }

}
