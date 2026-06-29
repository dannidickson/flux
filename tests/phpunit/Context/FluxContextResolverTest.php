<?php

namespace Flux\Tests\Context;

use Flux\Context\FluxContext;
use Flux\Context\FluxContextResolver;
use SilverStripe\Core\Config\Config;
use SilverStripe\Dev\SapphireTest;
use SilverStripe\ORM\CMSPreviewable;
use SilverStripe\ORM\DataObject;

class FluxContextResolverTest extends SapphireTest
{
    protected $usesDatabase = false;

    /**
     * Returns a unique [pageClass, productClass] pair per test, declared as
     * anonymous classes so they never enter the class manifest (which would
     * otherwise force a temp DB to spin up).
     */
    private function stubClasses(): array
    {
        $pageClass = get_class(new class extends DataObject implements CMSPreviewable {
            public function PreviewLink($action = null): ?string { return '/test/' . $this->ID; }
            public function getMimeType(): string { return 'text/html'; }
            public function CMSEditLink(): ?string { return null; }
        });

        $productClass = get_class(new class extends DataObject {});

        Config::modify()->set($pageClass, 'db', ['Title' => 'Varchar', 'Subtitle' => 'Varchar']);
        Config::modify()->set($pageClass, 'flux_fields', [
            'Title' => '.page__title',
            'Subtitle' => '.page__subtitle',
        ]);

        Config::modify()->set($productClass, 'db', ['Name' => 'Varchar']);
        Config::modify()->set($productClass, 'flux_fields', ['Name' => '.product__name']);

        return [$pageClass, $productClass];
    }

    public function testEmptyContext(): void
    {
        $context = FluxContext::empty();

        $this->assertSame(FluxContext::SCOPE_PAGE, $context->scopeKind);
        $this->assertNull($context->scopeOwnerId);
        $this->assertSame([], $context->segments);
        $this->assertFalse($context->hasContent());
    }

    public function testPageContextForCmsPreviewableRecord(): void
    {
        [$pageClass] = $this->stubClasses();
        $page = $pageClass::create();
        $page->ID = 1;

        $context = (new FluxContextResolver())->forRecord($page);

        $this->assertSame(FluxContext::SCOPE_PAGE, $context->scopeKind);
        $this->assertNull($context->scopeOwnerId);
        $this->assertSame(1, $context->pageId);
        $this->assertSame($pageClass, $context->pageClass);
        $this->assertSame('Page', $context->segments[0]['Type']);
        $this->assertSame('1', $context->segments[0]['ID']);
        $this->assertArrayHasKey($pageClass, $context->schema);
        $this->assertArrayHasKey('Title', $context->schema[$pageClass]['Fields']);
        $this->assertArrayHasKey('Subtitle', $context->schema[$pageClass]['Fields']);
    }

    public function testRelationItemContextForNonPreviewableDataObject(): void
    {
        [, $productClass] = $this->stubClasses();
        $product = $productClass::create();
        $product->ID = 42;

        $context = (new FluxContextResolver())->forRecord($product);

        $this->assertSame(FluxContext::SCOPE_RELATION_ITEM, $context->scopeKind);
        $this->assertSame('42', $context->scopeOwnerId);
        $this->assertNull($context->pageId);
        $this->assertSame('RelationItem', $context->segments[0]['Type']);
        $this->assertSame($productClass, $context->segments[0]['ClassName']);
        $this->assertArrayHasKey($productClass, $context->schema);
    }

    public function testItemIdWithoutElementalAreaFallsBackToPage(): void
    {
        [$pageClass] = $this->stubClasses();
        $page = $pageClass::create();
        $page->ID = 1;

        // itemID present but page has no ElementalArea() method → page context.
        $context = (new FluxContextResolver())->forRecord($page, 999);

        $this->assertSame(FluxContext::SCOPE_PAGE, $context->scopeKind);
    }

    public function testJsonSerializeShape(): void
    {
        [$pageClass] = $this->stubClasses();
        $page = $pageClass::create();
        $page->ID = 1;

        $context = (new FluxContextResolver())->forRecord($page);
        $json = $context->jsonSerialize();

        $this->assertSame(['kind' => FluxContext::SCOPE_PAGE, 'ownerId' => null], $json['scope']);
        $this->assertSame(1, $json['page']['id']);
        $this->assertSame($pageClass, $json['page']['class']);
        $this->assertNotEmpty($json['segments']);
        $this->assertNotEmpty($json['schema']);
    }
}
