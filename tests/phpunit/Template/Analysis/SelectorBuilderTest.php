<?php

namespace Flux\Tests\Template\Analysis;

use Flux\Template\Analysis\SelectorBuilder;
use PHPUnit\Framework\TestCase;

class SelectorBuilderTest extends TestCase
{

    private SelectorBuilder $builder;

    protected function setUp(): void
    {
        $this->builder = new SelectorBuilder();
    }

    public function testSoleContentResolvesToClassSelector(): void
    {
        $scan = $this->builder->scan(
            '<div class="page__title"><flux-var data-field="Title"></flux-var></div>',
        );

        $this->assertSame(['Title' => '.page__title'], $scan->selectors);
    }

    public function testMultipleClassesAreJoined(): void
    {
        $scan = $this->builder->scan(
            '<div class="a b"><flux-var data-field="Title"></flux-var></div>',
        );

        $this->assertSame('.a.b', $scan->selectors['Title']);
    }

    public function testUnclassedElementIsQualifiedByNearestClassedAncestor(): void
    {
        $scan = $this->builder->scan(
            '<div class="card"><div class="card-body"><p><flux-var data-field="Summary"></flux-var></p></div></div>',
        );

        $this->assertSame('.card-body p', $scan->selectors['Summary']);
    }

    public function testAncestorLookupSkipsUnclassedIntermediates(): void
    {
        $scan = $this->builder->scan(
            '<section class="hero"><div><h1><flux-var data-field="Title"></flux-var></h1></div></section>',
        );

        $this->assertSame('.hero h1', $scan->selectors['Title']);
    }

    public function testBareElementWithNoClassedAncestorIsDropped(): void
    {
        $scan = $this->builder->scan('<h1><flux-var data-field="Title"></flux-var></h1>');

        $this->assertSame([], $scan->selectors);
        $this->assertArrayHasKey('Title', $scan->unresolved);
    }

    public function testAmbiguousQualifiedSelectorIsDropped(): void
    {
        // Two <p> under .card-body: `.card-body p` would patch the wrong one.
        $scan = $this->builder->scan(
            '<div class="card-body"><p>Intro</p><p><flux-var data-field="Summary"></flux-var></p></div>',
        );

        $this->assertSame([], $scan->selectors);
        $this->assertStringContainsString('.card-body p', $scan->unresolved['Summary']);
    }

    public function testFieldResolvedElsewhereIsNotReportedUnresolved(): void
    {
        $scan = $this->builder->scan(
            '<h1><flux-var data-field="Title"></flux-var></h1>'
            . '<span class="menu"><flux-var data-field="Title"></flux-var></span>',
        );

        $this->assertSame('.menu', $scan->selectors['Title']);
        $this->assertSame([], $scan->unresolved);
    }

    public function testAttributeMarkerOnUnclassedElementIsQualified(): void
    {
        $scan = $this->builder->scan(
            '<div class="wrap"><a href="' . SelectorBuilder::attrMarker('Link') . '">Go</a></div>',
        );

        $this->assertSame('.wrap a', $scan->attributeSelectors['Link']);
    }

    public function testSharedElementIsNotSoleContent(): void
    {
        $scan = $this->builder->scan(
            '<div class="intro"><flux-var data-field="Summary"></flux-var> '
            . '<flux-var data-field="Content"></flux-var></div>',
        );

        $this->assertSame([], $scan->selectors);
    }

    public function testInertPlaceholderIsIgnored(): void
    {
        // A placeholder without data-field occupies space but never binds…
        $scan = $this->builder->scan(
            '<div class="c"><flux-var></flux-var><flux-var data-field="Title"></flux-var></div>',
        );

        // …and here it means Title is no longer sole content.
        $this->assertSame([], $scan->selectors);
    }

    public function testRepeatedFieldJoinsSelectors(): void
    {
        $scan = $this->builder->scan(
            '<h1 class="t"><flux-var data-field="Title"></flux-var></h1>'
            . '<span class="menu"><flux-var data-field="Title"></flux-var></span>',
        );

        $this->assertSame('.t, .menu', $scan->selectors['Title']);
    }

    public function testIdenticalSelectorsAreDeduped(): void
    {
        $scan = $this->builder->scan(
            '<p class="x"><flux-var data-field="Title"></flux-var></p>'
            . '<p class="x"><flux-var data-field="Title"></flux-var></p>',
        );

        $this->assertSame('.x', $scan->selectors['Title']);
    }

    public function testAttributeMarkerResolvesToCarryingElement(): void
    {
        $scan = $this->builder->scan(
            '<div class="bg color--' . SelectorBuilder::attrMarker('Options') . '"></div>',
        );

        $this->assertSame([], $scan->selectors);
        // The marker-polluted class is dropped; the real class remains.
        $this->assertSame('.bg', $scan->attributeSelectors['Options']);
    }

    public function testAnonymousAttributeMarkerBindsNothing(): void
    {
        $scan = $this->builder->scan(
            '<a href="' . SelectorBuilder::ATTR_MARKER . '" class="link">Go</a>',
        );

        $this->assertSame([], $scan->attributeSelectors);
    }

    public function testItemSelectorIsFirstElement(): void
    {
        $selector = $this->builder->itemSelector(
            '  <li class="card"><flux-var data-field="Name"></flux-var></li>',
        );

        $this->assertSame('.card', $selector);
    }

    public function testItemSelectorRejectsUnclassedWrapper(): void
    {
        $selector = $this->builder->itemSelector(
            '<li><flux-var data-field="Name"></flux-var></li>',
            $detail,
        );

        $this->assertNull($selector);
        $this->assertNotNull($detail);
    }

}
