<?php

namespace Flux\Tests\Template\Analysis;

use Flux\Template\Analysis\AnalysisResult;
use Flux\Template\Analysis\ClassResolver;
use Flux\Template\Analysis\FieldBinding;
use Flux\Template\Analysis\IncludeResolver;
use Flux\Template\Analysis\SelectorBuilder;
use Flux\Template\Analysis\SkipReport;
use Flux\Template\Analysis\TemplateAnalyzer;
use Flux\Template\Parser\Parser;
use PHPUnit\Framework\TestCase;

/**
 * Phase 5: loop item selectors + relation fields, `<% include %>` with argument
 * binding, and cross-scope `$Up` / `$Top` resolution, all as plain PHPUnit.
 */
class RelationsIncludesTest extends TestCase
{

    private function schema(): ArraySchemaInspector
    {
        return new ArraySchemaInspector([
            'Page' => [
                'db' => ['Title' => 'Varchar', 'Content' => 'HTMLText'],
                'has_many' => ['Items' => 'Item'],
            ],
            'Item' => ['db' => ['Name' => 'Varchar', 'Price' => 'Currency']],
        ]);
    }

    /** @param array<string, string> $includes */
    private function analyse(string $template, array $includes = []): AnalysisResult
    {
        $analyzer = new TemplateAnalyzer(
            new ClassResolver($this->schema()),
            new SelectorBuilder(),
            new IncludeResolver(new ArrayIncludeLocator($includes)),
        );

        return $analyzer->analyze(Parser::parse($template), 'Page');
    }

    private function binding(AnalysisResult $result, string $field, string $scope): ?FieldBinding
    {
        foreach ($result->bindings as $b) {
            if ($b->field === $field && $b->scope === $scope) {
                return $b;
            }
        }

        return null;
    }

    public function testLoopProducesItemSelectorAndFields(): void
    {
        $result = $this->analyse(
            '<% loop $Items %><li class="card"><span class="name">$Name</span></li><% end_loop %>',
        );

        $relations = $result->relationsByName();
        $this->assertArrayHasKey('Items', $relations);

        $items = $relations['Items'];
        $this->assertSame('Item', $items->class);
        $this->assertSame('.card', $items->itemSelector);

        $this->assertCount(1, $items->fields);
        $this->assertSame('Name', $items->fields[0]->field);
        $this->assertSame('.name', $items->fields[0]->selector);
    }

    public function testUpTitleInsideLoopBindsToPageNotRelation(): void
    {
        $result = $this->analyse(
            '<% loop $Items %>'
            . '<span class="n">$Name</span><em class="t">$Up.Title</em>'
            . '<% end_loop %>',
        );

        // Title belongs to the page, wrapped by loop markup → page binding.
        $page = $this->binding($result, 'Title', FieldBinding::SCOPE_PAGE);
        $this->assertNotNull($page);
        $this->assertSame('Page', $page->class);
        $this->assertSame('.t', $page->selector);

        // …and it must NOT be counted among the relation's own fields.
        $fieldNames = array_map(function ($binding) {
            return $binding->field;
        }, $result->relationsByName()['Items']->fields);
        $this->assertSame(['Name'], $fieldNames);
    }

    public function testTopResolvesToRootScope(): void
    {
        $result = $this->analyse(
            '<% loop $Items %><em class="tt">$Top.Title</em><% end_loop %>',
        );

        $binding = $this->binding($result, 'Title', FieldBinding::SCOPE_PAGE);
        $this->assertNotNull($binding);
        $this->assertSame('.tt', $binding->selector);
    }

    public function testIncludeIsSplicedIntoCurrentScope(): void
    {
        $result = $this->analyse(
            '<% include Sidebar %>',
            ['Sidebar' => '<aside class="side">$Content</aside>'],
        );

        $binding = $this->binding($result, 'Content', FieldBinding::SCOPE_PAGE);
        $this->assertNotNull($binding);
        $this->assertSame('.side', $binding->selector);
    }

    public function testMissingIncludeIsReportedLoudly(): void
    {
        $result = $this->analyse('<% include Nope %>');

        $reasons = array_map(function ($skip) {
            return $skip->reason;
        }, $result->skips);
        $this->assertContains(SkipReport::INCLUDE_NOT_FOUND, $reasons);
        $this->assertSame('Nope', $result->skips[0]->field);
    }

    public function testIncludeArgumentBindsToCallerField(): void
    {
        // Inside the partial, $Value resolves to the caller's $Title.
        $result = $this->analyse(
            '<% include Field Value=$Title %>',
            ['Field' => '<div class="f">$Value</div>'],
        );

        $binding = $this->binding($result, 'Title', FieldBinding::SCOPE_PAGE);
        $this->assertNotNull($binding);
        $this->assertSame('.f', $binding->selector);

        // The partial's own name `$Value` is not a page field, so no stray skip.
        $this->assertNull($this->binding($result, 'Value', FieldBinding::SCOPE_PAGE));
    }

    public function testIncludeWithLiteralArgumentProducesNoBinding(): void
    {
        $result = $this->analyse(
            '<% include Field Value=2 %>',
            ['Field' => '<div class="f">$Value</div>'],
        );

        $this->assertNull($this->binding($result, 'Value', FieldBinding::SCOPE_PAGE));
        $this->assertSame([], $result->bindings);
    }

    public function testLiteralArgumentInlinesIntoAttribute(): void
    {
        // The caller's literal class lands in the partial's markup, so the
        // field inside binds to a real selector.
        $result = $this->analyse(
            '<% include Field ExtraClass="page__title" %>',
            ['Field' => '<h1 class="$ExtraClass">$Title</h1>'],
        );

        $binding = $this->binding($result, 'Title', FieldBinding::SCOPE_PAGE);
        $this->assertNotNull($binding);
        $this->assertSame('.page__title', $binding->selector);
    }

    public function testSelfReferentialIncludeDoesNotRecurseForever(): void
    {
        $result = $this->analyse(
            '<% include Loopy %>',
            ['Loopy' => 'x<% include Loopy %>'],
        );

        // Completing at all is the assertion; the cycle guard stops re-expansion.
        $this->assertInstanceOf(AnalysisResult::class, $result);
    }

}
