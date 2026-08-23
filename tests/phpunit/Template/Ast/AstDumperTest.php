<?php

namespace Flux\Tests\Template\Ast;

use Flux\Template\Ast\AstDumper;
use Flux\Template\Parser\Parser;
use PHPUnit\Framework\TestCase;

/**
 * The dumper is the first NodeVisitor implementation; these tests double as a
 * check that the visitor covers the node kinds the config task cares about.
 */
class AstDumperTest extends TestCase
{

    private function dump(string $source): array
    {
        return (new AstDumper())->dump(Parser::parse($source));
    }

    public function testTextAndVariable(): void
    {
        $dump = $this->dump('<h1>$Title</h1>');

        $this->assertSame('text', $dump[0]['type']);
        $this->assertSame('<h1>', $dump[0]['text']);

        $this->assertSame('var', $dump[1]['type']);
        $this->assertSame('Title', $dump[1]['field']);
        $this->assertSame('$Title', $dump[1]['raw']);
    }

    public function testConditionExposesTriggerAndBody(): void
    {
        // This is the shape the reactive-regions work reads: condition + body.
        $dump = $this->dump('<% if $ShowTitle %><h2 class="t">$Title</h2><% end_if %>');

        $if = $dump[0];
        $this->assertSame('if', $if['type']);
        $this->assertSame('$ShowTitle', $if['branches'][0]['condition']);

        $body = $if['branches'][0]['body'];
        $this->assertSame('var', $body[1]['type']);
        $this->assertSame('Title', $body[1]['field']);
    }

    public function testLoopSubjectAndBody(): void
    {
        $dump = $this->dump('<% loop $Items %><li class="i">$Name</li><% end_loop %>');

        $loop = $dump[0];
        $this->assertSame('loop', $loop['type']);
        $this->assertSame('Items', $loop['subject']['lookup']);
        $this->assertSame('Name', $loop['body'][1]['field']);
    }

    public function testExpressionDetailIsDumped(): void
    {
        $dump = $this->dump('$Up.Author.Name');

        $expr = $dump[0]['expression'];
        $this->assertSame('Author', $expr['lookup']);
        $this->assertSame(1, $expr['scopeHops']);
        $this->assertSame(['Name'], $expr['accessors']);
    }

}
