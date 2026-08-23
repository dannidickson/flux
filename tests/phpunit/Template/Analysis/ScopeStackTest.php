<?php

namespace Flux\Tests\Template\Analysis;

use Flux\Template\Analysis\Scope;
use Flux\Template\Analysis\ScopeStack;
use PHPUnit\Framework\TestCase;

class ScopeStackTest extends TestCase
{

    public function testRootIsBothCurrentAndTop(): void
    {
        $root = new Scope('Page', Scope::ROOT);
        $stack = new ScopeStack($root);

        $this->assertSame($root, $stack->current());
        $this->assertSame($root, $stack->top());
        $this->assertSame(1, $stack->depth());
    }

    public function testPushAndPop(): void
    {
        $stack = new ScopeStack(new Scope('Page'));
        $child = new Scope('Item', Scope::LOOP, 'Items');

        $stack->push($child);
        $this->assertSame($child, $stack->current());
        $this->assertSame(2, $stack->depth());

        $this->assertSame($child, $stack->pop());
        $this->assertSame('Page', $stack->current()->class);
    }

    public function testPopNeverRemovesRoot(): void
    {
        $stack = new ScopeStack(new Scope('Page'));

        $stack->pop();
        $this->assertSame(1, $stack->depth());
        $this->assertSame('Page', $stack->current()->class);
    }

    public function testUpWalksOutFrames(): void
    {
        $root = new Scope('Page');
        $child = new Scope('Item', Scope::LOOP, 'Items');
        $stack = new ScopeStack($root);
        $stack->push($child);

        $this->assertSame($child, $stack->up(0));
        $this->assertSame($root, $stack->up(1));
    }

    public function testUpBeyondRootIsOpaque(): void
    {
        $stack = new ScopeStack(new Scope('Page'));

        $this->assertTrue($stack->up(1)->isOpaque());
    }

    public function testResolveForHonoursScopeInfo(): void
    {
        $root = new Scope('Page');
        $child = new Scope('Item', Scope::LOOP, 'Items');
        $stack = new ScopeStack($root);
        $stack->push($child);

        $this->assertSame($child, $stack->resolveFor(0, false));
        $this->assertSame($root, $stack->resolveFor(0, true)); // $Top
        $this->assertSame($root, $stack->resolveFor(1, false)); // $Up
    }

}
