<?php

namespace Flux\Tests\Template\Analysis;

use Flux\Template\Analysis\ClassResolver;
use PHPUnit\Framework\TestCase;

class ClassResolverTest extends TestCase
{

    private function resolver(): ClassResolver
    {
        return new ClassResolver(new ArraySchemaInspector([
            'Page' => [
                'db' => ['Title' => 'Varchar', 'Content' => 'HTMLText'],
                'has_one' => ['Hero' => 'Image'],
                'has_many' => ['Items' => 'Item'],
                'many_many' => [
                    'Tags' => ['through' => 'PageTag', 'from' => 'Page', 'to' => 'Tag'],
                    'Related' => 'Page.Related',
                ],
            ],
            'Item' => ['db' => ['Name' => 'Varchar']],
            'Image' => ['db' => ['Title' => 'Varchar']],
            'PageTag' => ['db' => []],
        ]));
    }

    public function testIsFieldForDbAndHasOne(): void
    {
        $resolver = $this->resolver();

        $this->assertTrue($resolver->isField('Page', 'Title'));
        $this->assertTrue($resolver->isField('Page', 'Hero'));
        $this->assertFalse($resolver->isField('Page', 'Bogus'));
    }

    public function testIsFieldOnOpaqueClassIsFalse(): void
    {
        $this->assertFalse($this->resolver()->isField(null, 'Title'));
    }

    public function testLoopItemClassFromHasMany(): void
    {
        $this->assertSame('Item', $this->resolver()->loopItemClass('Page', 'Items'));
    }

    public function testLoopItemClassUnwrapsManyManyThrough(): void
    {
        $this->assertSame('PageTag', $this->resolver()->loopItemClass('Page', 'Tags'));
    }

    public function testLoopItemClassResolvesDotNotation(): void
    {
        $this->assertSame('Page', $this->resolver()->loopItemClass('Page', 'Related'));
    }

    public function testLoopOverNonListRelationIsOpaque(): void
    {
        $this->assertNull($this->resolver()->loopItemClass('Page', 'Title'));
        $this->assertNull($this->resolver()->loopItemClass('Page', 'Hero'));
    }

    public function testWithClassFromHasOne(): void
    {
        $this->assertSame('Image', $this->resolver()->withClass('Page', 'Hero'));
    }

    public function testWithOverNonHasOneIsOpaque(): void
    {
        $this->assertNull($this->resolver()->withClass('Page', 'Items'));
        $this->assertNull($this->resolver()->withClass('Page', 'Title'));
    }

}
