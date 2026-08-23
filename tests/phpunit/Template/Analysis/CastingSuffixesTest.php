<?php

namespace Flux\Tests\Template\Analysis;

use Flux\Template\Analysis\CastingSuffixes;
use Flux\Template\Ast\Expression\LookupNode;
use Flux\Template\Lexer\Lexer;
use Flux\Template\Parser\ExpressionParser;
use PHPUnit\Framework\TestCase;

class CastingSuffixesTest extends TestCase
{

    private CastingSuffixes $suffixes;

    protected function setUp(): void
    {
        $this->suffixes = new CastingSuffixes();
    }

    private function lookup(string $source): LookupNode
    {
        return (new ExpressionParser())->parse(Lexer::stream($source));
    }

    public function testKnownSuffixesAreRecognisedCaseInsensitively(): void
    {
        $this->assertTrue($this->suffixes->isKnown('XML'));
        $this->assertTrue($this->suffixes->isKnown('nice'));
        $this->assertTrue($this->suffixes->isKnown('LimitCharacters'));
    }

    public function testRealPropertyNamesAreNotSuffixes(): void
    {
        $this->assertFalse($this->suffixes->isKnown('Name'));
        $this->assertFalse($this->suffixes->isKnown('Author'));
    }

    public function testBareVariableIsPureFormatting(): void
    {
        $this->assertTrue($this->suffixes->isPureFormatting($this->lookup('$Title')));
    }

    public function testCastingSuffixChainIsPureFormatting(): void
    {
        $this->assertTrue($this->suffixes->isPureFormatting($this->lookup('$Content.XML')));
        $this->assertTrue($this->suffixes->isPureFormatting($this->lookup('$Title.LimitCharacters(20)')));
    }

    public function testRelationTraversalIsNotPureFormatting(): void
    {
        $this->assertFalse($this->suffixes->isPureFormatting($this->lookup('$Author.Name')));
    }

}
