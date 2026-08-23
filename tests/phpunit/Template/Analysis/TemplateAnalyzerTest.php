<?php

namespace Flux\Tests\Template\Analysis;

use Flux\Schema\UpdateMode;
use Flux\Template\Analysis\AnalysisResult;
use Flux\Template\Analysis\FieldBinding;
use Flux\Template\Analysis\SkipReport;
use Flux\Template\Analysis\TemplateAnalyzer;
use Flux\Template\Parser\Parser;
use PHPUnit\Framework\TestCase;

/**
 * Drives the analyzer end-to-end against an in-memory schema, with no ORM needed. Fixtures:
 *   Page db: Title, Content, Summary · has_one: Hero→Image · has_many: Items→Item
 *   Item db: Name, Price
 *   Image db: Title (URL is a method, not a field)
 */
class TemplateAnalyzerTest extends TestCase
{

    private function analyse(string $template, string $class = 'Page'): AnalysisResult
    {
        $analyzer = TemplateAnalyzer::fromInspector(new ArraySchemaInspector([
            'Page' => [
                'db' => [
                    'Title' => 'Varchar',
                    'Content' => 'HTMLText',
                    'Summary' => 'Text',
                    'ShowTitle' => 'Boolean',
                    'ShowButton' => 'Boolean',
                    'HasContent' => 'Boolean',
                ],
                'has_one' => ['Hero' => 'Image'],
                'has_many' => ['Items' => 'Item'],
            ],
            'Item' => [
                'db' => [
                    'Name' => 'Varchar',
                    'Price' => 'Currency',
                    'Active' => 'Boolean',
                ],
            ],
            'Image' => [
                'db' => [
                    'Title' => 'Varchar',
                ],
            ],
        ]));

        return $analyzer->analyze(Parser::parse($template), $class);
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

    /** @return string[] reasons for the given field across all skips */
    private function skipReasons(AnalysisResult $result, string $field): array
    {
        $reasons = [];

        foreach ($result->skips as $s) {
            if ($s->field !== $field) {
                continue;
            }

            $reasons[] = $s->reason;
        }

        return $reasons;
    }

    public function testPageFieldBindsToClassSelector(): void
    {
        $result = $this->analyse('<div class="page__title">$Title</div>');

        $binding = $this->binding($result, 'Title', FieldBinding::SCOPE_PAGE);
        $this->assertNotNull($binding);
        $this->assertSame('.page__title', $binding->selector);
        $this->assertSame('Page', $binding->class);
    }

    public function testUnclassedElementIsQualifiedByAncestor(): void
    {
        $result = $this->analyse('<header class="hero"><h1>$Title</h1></header>');

        $this->assertSame('.hero h1', $this->binding($result, 'Title', 'page')->selector);
    }

    public function testBareElementIsSkippedLoudly(): void
    {
        $result = $this->analyse('<h1>$Title</h1>');

        $this->assertNull($this->binding($result, 'Title', 'page'));
        $this->assertSame([SkipReport::NO_UNIQUE_SELECTOR], $this->skipReasons($result, 'Title'));
    }

    public function testUnknownFieldIsSkippedLoudly(): void
    {
        $result = $this->analyse('<div class="x">$Nonexistent</div>');

        $this->assertNull($this->binding($result, 'Nonexistent', 'page'));
        $this->assertSame([SkipReport::UNKNOWN_FIELD], $this->skipReasons($result, 'Nonexistent'));
    }

    public function testSharedElementIsNotSoleContent(): void
    {
        $result = $this->analyse('<div class="intro">$Summary $Content</div>');

        $this->assertSame([SkipReport::NOT_SOLE_CONTENT], $this->skipReasons($result, 'Summary'));
        $this->assertSame([SkipReport::NOT_SOLE_CONTENT], $this->skipReasons($result, 'Content'));
        $this->assertSame([], $result->bindingsInScope('page'));
    }

    public function testAttributeFieldBindsToCarryingElementWithTemplateMode(): void
    {
        $result = $this->analyse('<div class="bg color--$Summary">Go</div>');

        $binding = $this->binding($result, 'Summary', 'page');
        $this->assertNotNull($binding);
        $this->assertSame('.bg', $binding->selector);
        $this->assertSame(UpdateMode::TEMPLATE, $binding->updateMode);
    }

    public function testAttributeNonFieldIsSkippedAsUnknown(): void
    {
        $result = $this->analyse('<a href="$Link" class="link">Go</a>');

        $this->assertSame([SkipReport::UNKNOWN_FIELD], $this->skipReasons($result, 'Link'));
        $this->assertNull($this->binding($result, 'Link', 'page'));
    }

    public function testFieldInTwoElementsJoinsSelectors(): void
    {
        $result = $this->analyse(
            '<h1 class="t">$Title</h1><span class="menu">$Title</span>',
        );

        $binding = $this->binding($result, 'Title', 'page');
        $this->assertNotNull($binding);
        $this->assertSame('.t, .menu', $binding->selector);
        $this->assertSame(UpdateMode::TEXT, $binding->updateMode);
    }

    public function testCastingSuffixResolvesToUnderlyingField(): void
    {
        $result = $this->analyse('<div class="body">$Content.XML</div>');

        $binding = $this->binding($result, 'Content', 'page');
        $this->assertNotNull($binding);
        $this->assertSame('.body', $binding->selector);
    }

    public function testFieldInsideIfBindsInSameScope(): void
    {
        $result = $this->analyse(
            '<% if $ShowContent %><div class="body">$Content</div><% end_if %>',
        );

        $this->assertSame('.body', $this->binding($result, 'Content', 'page')->selector);
    }

    public function testFieldsInBothIfAndElseAreDiscovered(): void
    {
        $result = $this->analyse(
            '<% if $A %><h1 class="t">$Title</h1><% else %><p class="s">$Summary</p><% end_if %>',
        );

        $this->assertSame('.t', $this->binding($result, 'Title', 'page')->selector);
        $this->assertSame('.s', $this->binding($result, 'Summary', 'page')->selector);
    }

    public function testWithBlockBindsAgainstRelatedClass(): void
    {
        $result = $this->analyse(
            '<% with $Hero %><figure class="hero">$Title</figure><% end_with %>',
        );

        // No page-scope binding: Title here is Image.Title.
        $this->assertNull($this->binding($result, 'Title', 'page'));

        $binding = $this->binding($result, 'Title', 'Hero');
        $this->assertNotNull($binding);
        $this->assertSame('Image', $binding->class);
        $this->assertSame('.hero', $binding->selector);
    }

    public function testWithOverUnresolvableRelationIsOpaque(): void
    {
        $result = $this->analyse(
            '<% with $Mystery %><div class="x">$Whatever</div><% end_with %>',
        );

        $this->assertSame([SkipReport::OPAQUE_SCOPE], $this->skipReasons($result, 'Whatever'));
    }

    public function testLoopTracksItemScope(): void
    {
        $result = $this->analyse(
            '<% loop $Items %><li class="item">$Name</li><% end_loop %>',
        );

        $binding = $this->binding($result, 'Name', 'Items');
        $this->assertNotNull($binding);
        $this->assertSame('Item', $binding->class);
        $this->assertSame('.item', $binding->selector);
    }

    public function testLoopFieldNotOnItemClassIsSkipped(): void
    {
        // $Title isn't on Item, so this should be an unknown-field skip, not a binding.
        $result = $this->analyse(
            '<% loop $Items %><li class="item">$Title</li><% end_loop %>',
        );

        $this->assertNull($this->binding($result, 'Title', 'Items'));
        $this->assertContains(SkipReport::UNKNOWN_FIELD, $this->skipReasons($result, 'Title'));
    }

    public function testLoopOverNonRelationIsOpaque(): void
    {
        $result = $this->analyse(
            '<% loop $Title %><span class="x">$Name</span><% end_loop %>',
        );

        $this->assertSame([SkipReport::OPAQUE_SCOPE], $this->skipReasons($result, 'Name'));
    }

    public function testNestedWithInsideLoopResolves(): void
    {
        // Item has no relations here, so a with inside the loop over an unknown
        // relation is opaque. Verifies scope nesting doesn't crash or leak.
        $result = $this->analyse(
            '<% loop $Items %><span class="n">$Name</span>'
            . '<% with $Sub %>$Whatever<% end_with %><% end_loop %>',
        );

        $this->assertNotNull($this->binding($result, 'Name', 'Items'));
        $this->assertSame([SkipReport::OPAQUE_SCOPE], $this->skipReasons($result, 'Whatever'));
    }

    public function testConditionOnlyBooleanBindsAsConditional(): void
    {
        $result = $this->analyse(
            '<% if $ShowTitle %><div class="cta-block__title"><span>$Title</span></div><% end_if %>',
        );

        $binding = $this->binding($result, 'ShowTitle', 'page');
        $this->assertNotNull($binding);
        $this->assertTrue($binding->isConditional);
        $this->assertSame(UpdateMode::TEMPLATE, $binding->updateMode);
        $this->assertSame('', $binding->selector);
    }

    public function testConditionGuardingRegionWithNoFieldsStillBinds(): void
    {
        $result = $this->analyse(
            '<% if $ShowButton %><button class="button">I am a button</button><% end_if %>',
        );

        $binding = $this->binding($result, 'ShowButton', 'page');
        $this->assertNotNull($binding);
        $this->assertTrue($binding->isConditional);
        $this->assertSame(UpdateMode::TEMPLATE, $binding->updateMode);
    }

    public function testIfElseIfElseEachNamesDifferentFieldAllBindConditionally(): void
    {
        $result = $this->analyse(
            '<% if $ShowTitle %><h1 class="t">$Title</h1>'
            . '<% else_if $ShowButton %><button class="b">Go</button>'
            . '<% else %><p class="s">$Summary</p><% end_if %>',
        );

        $this->assertTrue($this->binding($result, 'ShowTitle', 'page')->isConditional);
        $this->assertTrue($this->binding($result, 'ShowButton', 'page')->isConditional);
        $this->assertSame(UpdateMode::TEMPLATE, $this->binding($result, 'ShowTitle', 'page')->updateMode);
        $this->assertSame(UpdateMode::TEMPLATE, $this->binding($result, 'ShowButton', 'page')->updateMode);
    }

    public function testFieldNamedInTwoBranchesProducesOneConditionalBinding(): void
    {
        $result = $this->analyse(
            '<% if $ShowTitle %><h1 class="t">$Title</h1>'
            . '<% else_if $ShowTitle && $ShowButton %><p class="s">$Summary</p><% end_if %>',
        );

        $bindings = array_values(array_filter(
            $result->bindings,
            function (FieldBinding $binding) {
                return $binding->field === 'ShowTitle' && $binding->scope === 'page';
            },
        ));

        $this->assertCount(1, $bindings);
        $this->assertTrue($bindings[0]->isConditional);
    }

    public function testElseBodyFieldIsIndependentOfTheIfFields(): void
    {
        // $Summary only appears in the else body, never in a condition. It
        // still binds normally (rendered text), it just isn't itself a trigger.
        $result = $this->analyse(
            '<% if $ShowTitle %><h1 class="t">$Title</h1>'
            . '<% else %><p class="s">$Summary</p><% end_if %>',
        );

        $this->assertTrue($this->binding($result, 'ShowTitle', 'page')->isConditional);

        $summary = $this->binding($result, 'Summary', 'page');
        $this->assertNotNull($summary);
        $this->assertFalse($summary->isConditional);
        $this->assertSame(UpdateMode::TEXT, $summary->updateMode);
    }

    public function testConditionWithAndNamesBothFields(): void
    {
        $result = $this->analyse(
            '<% if $ShowTitle && $HasContent %><h1 class="t">$Title</h1><% end_if %>',
        );

        $this->assertTrue($this->binding($result, 'ShowTitle', 'page')->isConditional);
        $this->assertTrue($this->binding($result, 'HasContent', 'page')->isConditional);
    }

    public function testNestedIfBothFieldsBindConditionally(): void
    {
        $result = $this->analyse(
            '<% if $ShowTitle %><div class="outer">'
            . '<% if $HasContent %><span>$Title</span><% end_if %>'
            . '</div><% end_if %>',
        );

        $this->assertTrue($this->binding($result, 'ShowTitle', 'page')->isConditional);
        $this->assertTrue($this->binding($result, 'HasContent', 'page')->isConditional);
    }

    public function testConditionNamingNonFieldIsSkippedLoudly(): void
    {
        $result = $this->analyse(
            '<% if $IsStaging %><h1 class="t">$Title</h1><% end_if %>',
        );

        $this->assertNull($this->binding($result, 'IsStaging', 'page'));
        $this->assertSame([SkipReport::UNKNOWN_FIELD], $this->skipReasons($result, 'IsStaging'));
    }

    public function testConditionInsideLoopResolvesAgainstItemClass(): void
    {
        $result = $this->analyse(
            '<% loop $Items %><li class="item"><% if $Active %><span>$Name</span><% end_if %></li><% end_loop %>',
        );

        $binding = $this->binding($result, 'Active', 'Items');
        $this->assertNotNull($binding);
        $this->assertSame('Item', $binding->class);
        $this->assertTrue($binding->isConditional);
    }

    public function testCachedKeyArgsProduceNoBindingsOrSkips(): void
    {
        $result = $this->analyse(
            "<% cached 'CTABlock', \$LastEdited, \$ID %>"
            . '<% if $ShowTitle %><h1 class="t">$Title</h1><% end_if %>'
            . '<% end_cached %>',
        );

        $this->assertNull($this->binding($result, 'LastEdited', 'page'));
        $this->assertNull($this->binding($result, 'ID', 'page'));
        $this->assertSame([], $this->skipReasons($result, 'LastEdited'));
        $this->assertSame([], $this->skipReasons($result, 'ID'));
    }

    public function testFieldRenderedAsTextAndUsedInConditionProducesBothBindingModes(): void
    {
        $result = $this->analyse(
            '<% if $ShowTitle %><h1 class="t">$ShowTitle</h1><% end_if %>',
        );

        $matching = array_values(array_filter(
            $result->bindings,
            function (FieldBinding $binding) {
                return $binding->field === 'ShowTitle' && $binding->scope === 'page';
            },
        ));

        $modes = array_map(function (FieldBinding $binding) {
            return $binding->updateMode;
        }, $matching);
        $this->assertContains(UpdateMode::TEXT, $modes);
        $this->assertContains(UpdateMode::TEMPLATE, $modes);

        $conditional = array_values(array_filter($matching, function (FieldBinding $binding) {
            return $binding->isConditional;
        }));
        $this->assertNotEmpty($conditional);
    }

    public function testMultipleTemplatesWorthOfFieldsInOnePass(): void
    {
        $result = $this->analyse(
            '<header><h1 class="t">$Title</h1></header>'
            . '<div class="body">$Content</div>'
            . '<footer>$Summary and more</footer>',
        );

        $this->assertSame('.t', $this->binding($result, 'Title', 'page')->selector);
        $this->assertSame('.body', $this->binding($result, 'Content', 'page')->selector);
        // Summary shares <footer> with text → not sole content.
        $this->assertSame([SkipReport::NOT_SOLE_CONTENT], $this->skipReasons($result, 'Summary'));
    }

}
