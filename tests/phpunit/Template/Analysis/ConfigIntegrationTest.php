<?php

namespace Flux\Tests\Template\Analysis;

use Flux\Template\Analysis\ClassResolver;
use Flux\Template\Analysis\ConfigSchemaInspector;
use Flux\Template\Analysis\SelectorBuilder;
use Flux\Template\Analysis\TemplateAnalyzer;
use Flux\Template\Parser\Parser;
use Flux\Tests\Template\Analysis\Fixtures\FluxTestBlock;
use Flux\Tests\Template\Analysis\Fixtures\FluxTestImage;
use Flux\Tests\Template\Analysis\Fixtures\FluxTestPage;
use SilverStripe\Dev\SapphireTest;

/**
 * Covers the one piece that touches Silverstripe, {@see ConfigSchemaInspector}, so it
 * needs a {@see SapphireTest} and the ORM (run it under DDEV). Proves real config →
 * analyzer → `flux_fields` end-to-end; templates are supplied inline, not from disk.
 */
class ConfigIntegrationTest extends SapphireTest
{

    /** @var array<int, class-string> */
    // A native type here is fatal: SapphireTest declares the property untyped.
    // phpcs:ignore SlevomatCodingStandard.TypeHints.PropertyTypeHint.MissingNativeTypeHint
    protected static $extra_dataobjects = [
        FluxTestImage::class,
        FluxTestBlock::class,
        FluxTestPage::class,
    ];

    private function analyzer(): TemplateAnalyzer
    {
        return new TemplateAnalyzer(
            new ClassResolver(new ConfigSchemaInspector()),
            new SelectorBuilder(),
        );
    }

    public function testInspectorReadsRealConfig(): void
    {
        $schema = new ConfigSchemaInspector();

        $this->assertArrayHasKey('Title', $schema->db(FluxTestPage::class));
        $this->assertArrayHasKey('Content', $schema->db(FluxTestPage::class));
        $this->assertArrayHasKey('Blocks', $schema->hasMany(FluxTestPage::class));
        $this->assertTrue($schema->classExists(FluxTestPage::class));
    }

    public function testPageFieldsBindAgainstRealClass(): void
    {
        $tree = Parser::parse('<div class="page__title">$Title</div><p class="body">$Content</p>');
        $result = $this->analyzer()->analyze($tree, FluxTestPage::class);

        $page = $result->bindingsInScope();
        $this->assertSame('.page__title', $page['Title']->selector);
        $this->assertSame('.body', $page['Content']->selector);
        $this->assertSame(FluxTestPage::class, $page['Title']->class);
    }

    public function testLoopOverHasManyProducesRelationFields(): void
    {
        $tree = Parser::parse(
            '<% loop $Blocks %><li class="block"><h3 class="h">$Heading</h3></li><% end_loop %>',
        );
        $result = $this->analyzer()->analyze($tree, FluxTestPage::class);

        $relations = $result->relationsByName();
        $this->assertArrayHasKey('Blocks', $relations);

        $blocks = $relations['Blocks'];
        $this->assertSame(FluxTestBlock::class, $blocks->class);
        $this->assertSame('.block', $blocks->itemSelector);
        $this->assertCount(1, $blocks->fields);
        $this->assertSame('Heading', $blocks->fields[0]->field);
        $this->assertSame('.h', $blocks->fields[0]->selector);
    }

    public function testWithOverHasOneBindsAgainstRelatedClass(): void
    {
        $tree = Parser::parse('<% with $Hero %><figcaption class="cap">$Caption</figcaption><% end_with %>');
        $result = $this->analyzer()->analyze($tree, FluxTestPage::class);

        $binding = null;

        foreach ($result->bindings as $b) {
            if ($b->field !== 'Caption') {
                continue;
            }

            $binding = $b;
        }

        $this->assertNotNull($binding);
        $this->assertSame(FluxTestImage::class, $binding->class);
        $this->assertSame('.cap', $binding->selector);
    }

}
