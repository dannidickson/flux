<?php

namespace Flux\Template\Analysis;

use Flux\Schema\UpdateMode;
use Flux\Template\Ast\BodyContainer;
use Flux\Template\Ast\Expression\Expression;
use Flux\Template\Ast\Expression\LiteralNode;
use Flux\Template\Ast\Expression\LookupNode;
use Flux\Template\Ast\Node;
use Flux\Template\Ast\Node\IfNode;
use Flux\Template\Ast\Node\IncludeNode;
use Flux\Template\Ast\Node\TemplateNode;
use Flux\Template\Ast\Node\TextNode;
use Flux\Template\Ast\Node\VariableNode;
use Flux\Template\Ast\ScopeOpener;

/**
 * Walks a template AST against a DataObject's schema to produce {@see FieldBinding}s,
 * {@see RelationBinding}s and {@see SkipReport}s. Works one scope at a time: each scope's
 * HTML is rebuilt with `<flux-var>` placeholders and handed to the {@see SelectorBuilder}.
 *
 * @phpstan-type ChildScope array{
 *     scope: Scope,
 *     subject: string,
 *     kind: string,
 *     body: Node[],
 *     argFrames: array,
 *     argFrameDepths: array,
 *     includeStack: array
 * }
 */
final class TemplateAnalyzer
{

    private ScopeStack $stack;

    /** @var FieldBinding[] */
    private array $bindings = [];

    /** @var SkipReport[] */
    private array $skips = [];

    /** @var RelationBinding[] */
    private array $relations = [];

    /** @var array<int, array<string, Expression>> stack of include argument frames */
    private array $argFrames = [];

    /** @var int[] scope-stack depth captured when each argument frame was pushed */
    private array $argFrameDepths = [];

    /** @var string[] include names currently being expanded (cycle guard) */
    private array $includeStack = [];

    private readonly ClassResolver $classes;

    private readonly SelectorBuilder $selectors;

    private readonly ?IncludeResolver $includes;

    private readonly CastingSuffixes $suffixes;

    public function __construct(
        ClassResolver $classes,
        ?SelectorBuilder $selectors = null,
        ?IncludeResolver $includes = null,
        ?CastingSuffixes $suffixes = null,
    ) {
        $this->classes = $classes;
        $this->selectors = $selectors ?? new SelectorBuilder();
        $this->includes = $includes;
        $this->suffixes = $suffixes ?? new CastingSuffixes();
    }

    /**
     * Build an analyzer from a schema source alone (no include resolution).
     */
    public static function fromInspector(SchemaInspector $schema): self
    {
        return new self(new ClassResolver($schema));
    }

    public function analyze(TemplateNode $tree, string $rootClass): AnalysisResult
    {
        $this->bindings = [];
        $this->skips = [];
        $this->relations = [];
        $this->argFrames = [];
        $this->argFrameDepths = [];
        $this->includeStack = [];
        $this->stack = new ScopeStack(new Scope($rootClass, Scope::ROOT));

        $this->analyzeScope($tree->children);

        return new AnalysisResult($this->bindings, $this->skips, $this->relations);
    }

    /**
     * Analyse the current stack frame's body and recurse into any child scopes.
     * Returns the rendered HTML so a parent can derive a loop's item selector.
     *
     * @param Node[] $nodes
     */
    private function analyzeScope(array $nodes): string
    {
        $html = '';
        $candidates = []; // [ ['field' => string, 'offset' => int, 'scope' => Scope], … ]
        $children = []; // [ ['scope' => Scope, 'subject' => string, 'kind' => string, 'body' => Node[]], … ]
        $this->renderNodes($nodes, $html, $candidates, $children);

        $scan = $this->selectors->scan($html);

        foreach ($candidates as $candidate) {
            $field = $candidate['field'];
            $target = $candidate['scope'];

            if ($candidate['context'] === 'attribute') {
                if (isset($scan->attributeSelectors[$field])) {
                    $this->bindings[] = new FieldBinding(
                        $field,
                        $scan->attributeSelectors[$field],
                        (string) $target->class,
                        $this->scopeLabel($target),
                        UpdateMode::TEMPLATE,
                    );
                } elseif (isset($scan->unresolved[$field])) {
                    $this->skips[] = new SkipReport(
                        $field,
                        SkipReport::NO_UNIQUE_SELECTOR,
                        $scan->unresolved[$field],
                        $candidate['offset'],
                    );
                } else {
                    $this->skips[] = new SkipReport($field, SkipReport::ATTRIBUTE, '', $candidate['offset']);
                }

                continue;
            }

            if (isset($scan->selectors[$field])) {
                $this->bindings[] = new FieldBinding(
                    $field,
                    $scan->selectors[$field],
                    (string) $target->class,
                    $this->scopeLabel($target),
                );

                continue;
            }

            if (isset($scan->unresolved[$field])) {
                $this->skips[] = new SkipReport(
                    $field,
                    SkipReport::NO_UNIQUE_SELECTOR,
                    $scan->unresolved[$field],
                    $candidate['offset'],
                );

                continue;
            }

            $this->skips[] = new SkipReport($field, SkipReport::NOT_SOLE_CONTENT, '', $candidate['offset']);
        }

        foreach ($children as $child) {
            $before = count($this->bindings);

            // Restore the include-argument context active when this child was found.
            $savedArgFrames = $this->argFrames;
            $savedArgFrameDepths = $this->argFrameDepths;
            $savedIncludeStack = $this->includeStack;
            $this->argFrames = $child['argFrames'];
            $this->argFrameDepths = $child['argFrameDepths'];
            $this->includeStack = $child['includeStack'];

            $this->stack->push($child['scope']);
            $childHtml = $this->analyzeScope($child['body']);
            $this->stack->pop();

            $this->argFrames = $savedArgFrames;
            $this->argFrameDepths = $savedArgFrameDepths;
            $this->includeStack = $savedIncludeStack;

            if ($child['kind'] !== Scope::LOOP || $child['scope']->isOpaque()) {
                continue;
            }

            $this->recordRelation($child, $childHtml, array_slice($this->bindings, $before));
        }

        return $html;
    }

    /**
     * @param ChildScope $child
     * @param FieldBinding[] $produced bindings created while analysing the child
     */
    private function recordRelation(array $child, string $childHtml, array $produced): void
    {
        $relation = $child['subject'];
        $fields = array_values(array_filter($produced, function (FieldBinding $binding) use ($relation) {
            return $binding->scope === $relation;
        }));

        $itemSelector = $this->selectors->itemSelector($childHtml, $detail);

        if ($itemSelector === null) {
            $this->skips[] = new SkipReport($relation, SkipReport::NO_UNIQUE_SELECTOR, (string) $detail);
        }

        $this->relations[] = new RelationBinding(
            $relation,
            (string) $child['scope']->class,
            $itemSelector,
            $fields,
        );
    }

    /**
     * @param Node[] $nodes
     * @param array<int, array{field: string, offset: int, scope: Scope, context: string}> $candidates by ref
     * @param array<int, ChildScope> $children by ref
     */
    private function renderNodes(array $nodes, string &$html, array &$candidates, array &$children): void
    {
        foreach ($nodes as $node) {
            match (true) {
                $node instanceof TextNode => $html .= $node->text,
                $node instanceof VariableNode => $this->renderVariable($node, $html, $candidates),
                // `if` folds every branch into the current scope.
                $node instanceof IfNode => $this->renderConditional($node, $html, $candidates, $children),
                $node instanceof IncludeNode => $this->renderInclude($node, $html, $candidates, $children),
                // `loop` / `with` open a child scope; strip the body from this one and queue its own pass.
                $node instanceof ScopeOpener => $this->collectChild(
                    $node->getSubject(),
                    $node->getScopeKind(),
                    $node->getBody(),
                    $children,
                ),
                // `cached` and custom block tags fold their body into the current scope.
                $node instanceof BodyContainer => $this->renderNodes($node->getBody(), $html, $candidates, $children),
                // Comments, self-closing custom tags, require/i18n produce no output.
                default => null,
            };
        }
    }

    /**
     * Every branch plus `else` folds into the current scope, and every field
     * named in a branch condition binds as a condition-only field.
     *
     * @param array<int, array{field: string, offset: int, scope: Scope, context: string}> $candidates by ref
     * @param array<int, ChildScope> $children by ref
     */
    private function renderConditional(IfNode $node, string &$html, array &$candidates, array &$children): void
    {
        foreach ($node->branches as $branch) {
            $this->renderNodes($branch->body, $html, $candidates, $children);
        }

        $this->renderNodes($node->elseBody, $html, $candidates, $children);

        $this->bindConditionFields($node);
    }

    private function bindConditionFields(IfNode $node): void
    {
        $seen = [];

        foreach ($node->branches as $branch) {
            foreach (LookupCollector::collect($branch->expression) as $lookup) {
                $resolved = $this->resolveConditionLookup($lookup, $branch->offset);

                if ($resolved === null) {
                    continue;
                }

                $key = $resolved['field'] . '|' . $resolved['scope']->class . '|' . $resolved['scope']->kind;

                if (isset($seen[$key])) {
                    continue;
                }

                $seen[$key] = true;

                $this->bindings[] = new FieldBinding(
                    $resolved['field'],
                    '',
                    (string) $resolved['scope']->class,
                    $this->scopeLabel($resolved['scope']),
                    UpdateMode::TEMPLATE,
                    true,
                );
            }
        }
    }

    /**
     * Resolves like {@see renderVariable} (scope hops, arg frames, opaque
     * scopes, field check) minus the rendering
     *
     * @return array{field: string, scope: Scope}|null
     */
    private function resolveConditionLookup(LookupNode $lookup, int $offset): ?array
    {
        $field = $lookup->name;

        $hopAdjustment = 0;
        $arg = $this->currentArgFrame()[$field] ?? null;

        if ($arg !== null) {
            if (!$arg instanceof LookupNode) {
                return null; // a literal/constant argument can't gate a region
            }

            $lookup = $arg;
            $field = $arg->name;
            $hopAdjustment = $this->stack->depth() - $this->currentArgFrameDepth();
        }

        $target = $this->stack->resolveFor($lookup->scopeHops + $hopAdjustment, $lookup->fromTop);

        if ($target->isOpaque()) {
            $this->skips[] = new SkipReport($field, SkipReport::OPAQUE_SCOPE, $this->scopeLabel($target), $offset);

            return null;
        }

        if (!$this->classes->isField($target->class, $field)) {
            $this->skips[] = new SkipReport($field, SkipReport::UNKNOWN_FIELD, (string) $target->class, $offset);

            return null;
        }

        if (!$this->suffixes->isPureFormatting($lookup)) {
            $this->skips[] = new SkipReport($field, SkipReport::RELATION_ACCESSOR, '', $offset);

            return null;
        }

        return ['field' => $field, 'scope' => $target];
    }

    /**
     * Insert an `<% include %>`, binding its args to the caller's expressions.
     *
     * @param array<int, array{field: string, offset: int, scope: Scope, context: string}> $candidates by ref
     * @param array<int, ChildScope> $children by ref
     */
    private function renderInclude(IncludeNode $node, string &$html, array &$candidates, array &$children): void
    {
        if ($this->includes === null || in_array($node->template, $this->includeStack, true)) {
            return; // include support not wired, or a self-referential cycle
        }

        $tree = $this->includes->resolve($node->template);

        if ($tree === null) {
            $this->skips[] = new SkipReport($node->template, SkipReport::INCLUDE_NOT_FOUND, $node->template);

            return;
        }

        $this->argFrames[] = $this->buildArgFrame($node->args);
        $this->argFrameDepths[] = $this->stack->depth();
        $this->includeStack[] = $node->template;

        $this->renderNodes($tree->children, $html, $candidates, $children);

        array_pop($this->includeStack);
        array_pop($this->argFrameDepths);
        array_pop($this->argFrames);
    }

    /**
     * Build the include's argument frame, flattening through the caller's own
     * frame so a passed-through argument resolves to the original expression.
     *
     * @param array<string, Expression> $args
     * @return array<string, Expression>
     */
    private function buildArgFrame(array $args): array
    {
        $caller = $this->currentArgFrame();
        $frame = [];

        foreach ($args as $key => $expr) {
            // Only a bare $Y passes through the caller's argument named Y; a scoped
            // $Up.Y/$Top.Y names a real field, even if it shares the name.
            $isBareName = $expr instanceof LookupNode && $expr->scopeHops === 0 && !$expr->fromTop;

            if (!$isBareName || !isset($caller[$expr->name])) {
                $frame[$key] = $expr;

                continue;
            }

            $frame[$key] = $caller[$expr->name];
        }

        return $frame;
    }

    /**
     * @param array<int, array{field: string, offset: int, scope: Scope, context: string}> $candidates by ref
     */
    private function renderVariable(VariableNode $node, string &$html, array &$candidates): void
    {
        $lookup = $node->expression;
        $field = $lookup->name; // leading scope hops already stripped by the parser
        $inAttribute = $this->inAttributeContext($html);

        // Inside an include, a variable naming a passed argument resolves to the caller's
        // expression. hopAdjustment re-bases its scope hops, since the partial may use the
        // argument inside its own loop/with.
        $hopAdjustment = 0;
        $arg = $this->currentArgFrame()[$field] ?? null;

        if ($arg !== null) {
            if (!$arg instanceof LookupNode) {
                // A literal argument in an attribute becomes real markup; elsewhere
                // it can't bind, it just occupies space.
                $html .= match (true) {
                    $inAttribute && $arg instanceof LiteralNode => (string) $arg->value,
                    $inAttribute => SelectorBuilder::ATTR_MARKER,
                    default => $this->placeholder(null),
                };

                return;
            }

            $lookup = $arg;
            $field = $arg->name;
            $hopAdjustment = $this->stack->depth() - $this->currentArgFrameDepth();
        }

        // Resolve against the named frame; the placeholder still lands where it
        // physically renders.
        $target = $this->stack->resolveFor($lookup->scopeHops + $hopAdjustment, $lookup->fromTop);

        if ($target->isOpaque()) {
            $this->skips[] = new SkipReport(
                $field,
                SkipReport::OPAQUE_SCOPE,
                $this->scopeLabel($target),
                $node->offset,
            );
            $html .= $this->inertOutput($inAttribute);

            return;
        }

        if (!$this->classes->isField($target->class, $field)) {
            $this->skips[] = new SkipReport($field, SkipReport::UNKNOWN_FIELD, (string) $target->class, $node->offset);
            $html .= $this->inertOutput($inAttribute);

            return;
        }

        // `$Content.XML` still outputs the Content field, reformatted; `$Author.Name`
        // outputs a property of the related object, not the Author field itself.
        if (!$this->suffixes->isPureFormatting($lookup)) {
            $this->skips[] = new SkipReport($field, SkipReport::RELATION_ACCESSOR, $node->raw, $node->offset);
            $html .= $this->inertOutput($inAttribute);

            return;
        }

        // A `<flux-var>` element would corrupt an attribute value, so an attribute-embedded
        // field gets a plain token and binds to its carrying element instead.
        if ($inAttribute) {
            $candidates[] = [
                'field' => $field,
                'offset' => $node->offset,
                'scope' => $target,
                'context' => 'attribute',
            ];
            $html .= SelectorBuilder::attrMarker($field);

            return;
        }

        $candidates[] = ['field' => $field, 'offset' => $node->offset, 'scope' => $target, 'context' => 'content'];
        $html .= $this->placeholder($field);
    }

    /** Non-binding output that keeps the surrounding markup parseable. */
    private function inertOutput(bool $inAttribute): string
    {
        if ($inAttribute) {
            return SelectorBuilder::ATTR_MARKER;
        }

        return $this->placeholder(null);
    }

    /**
     * Resolve a `loop`/`with` subject to its child class (against the frame the
     * subject actually reads from) and queue the block's body for its own pass.
     *
     * @param array<int, ChildScope> $children by ref
     */
    private function collectChild(LookupNode $subject, string $kind, array $body, array &$children): void
    {
        $frame = $this->stack->resolveFor($subject->scopeHops, $subject->fromTop);
        $relation = $subject->name;

        $childClass = $this->classes->withClass($frame->class, $relation);

        if ($kind === Scope::LOOP) {
            $childClass = $this->classes->loopItemClass($frame->class, $relation);
        }

        $children[] = [
            'scope' => new Scope($childClass, $kind, $relation),
            'subject' => $relation,
            'kind' => $kind,
            'body' => $body,
            'argFrames' => $this->argFrames,
            'argFrameDepths' => $this->argFrameDepths,
            'includeStack' => $this->includeStack,
        ];
    }

    /** @return array<string, Expression> */
    private function currentArgFrame(): array
    {
        if ($this->argFrames === []) {
            return [];
        }

        return $this->argFrames[count($this->argFrames) - 1];
    }

    /** Scope-stack depth in effect where the current argument frame's expressions were written. */
    private function currentArgFrameDepth(): int
    {
        if ($this->argFrameDepths === []) {
            return $this->stack->depth();
        }

        return $this->argFrameDepths[count($this->argFrameDepths) - 1];
    }

    private function placeholder(?string $field): string
    {
        if ($field === null) {
            return '<flux-var></flux-var>';
        }

        return '<flux-var data-field="' . htmlspecialchars($field, ENT_QUOTES) . '"></flux-var>';
    }

    /**
     * True when the cursor sits inside an unclosed `<…` tag.
     * Example: the next output lands in an attribute rather than in element content.
     */
    private function inAttributeContext(string $html): bool
    {
        $lt = strrpos($html, '<');

        if ($lt === false) {
            return false;
        }

        $gt = strrpos($html, '>');

        return $gt === false || $lt > $gt;
    }

    private function scopeLabel(Scope $scope): string
    {
        if ($scope->kind === Scope::ROOT) {
            return FieldBinding::SCOPE_PAGE;
        }

        return (string) $scope->subject;
    }

}
