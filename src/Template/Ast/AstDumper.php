<?php

namespace Flux\Template\Ast;

use Flux\Template\Ast\Expression\BinaryExpression;
use Flux\Template\Ast\Expression\LiteralNode;
use Flux\Template\Ast\Expression\LookupNode;
use Flux\Template\Ast\Expression\MethodCall;
use Flux\Template\Ast\Expression\UnaryExpression;
use Flux\Template\Ast\Node\CachedNode;
use Flux\Template\Ast\Node\CommentNode;
use Flux\Template\Ast\Node\ConditionalBranch;
use Flux\Template\Ast\Node\ExtensionNode;
use Flux\Template\Ast\Node\I18nNode;
use Flux\Template\Ast\Node\IfNode;
use Flux\Template\Ast\Node\IncludeNode;
use Flux\Template\Ast\Node\LoopNode;
use Flux\Template\Ast\Node\RequireNode;
use Flux\Template\Ast\Node\TemplateNode;
use Flux\Template\Ast\Node\TextNode;
use Flux\Template\Ast\Node\VariableNode;
use Flux\Template\Ast\Node\WithNode;

/**
 * Creates a AST into an array format. Called via the Dev task
 *
 * @see FluxGenerateConfigTask.php
 */
final class AstDumper implements NodeVisitor
{

    /**
     * Dump a whole template to a list of node arrays (its root children).
     *
     * @return array<int, mixed>
     */
    public function dump(TemplateNode $tree): array
    {
        return $this->nodes($tree->children);
    }

    private function nodes(array $nodes): array
    {
        return array_map(function (Node $node) {
            return $node->accept($this);
        }, $nodes);
    }

    public function visitTemplate(TemplateNode $node): mixed
    {
        return ['type' => 'template', 'children' => $this->nodes($node->children)];
    }

    public function visitText(TextNode $node): mixed
    {
        return ['type' => 'text', 'text' => $node->text];
    }

    public function visitVariable(VariableNode $node): mixed
    {
        return [
            'type' => 'var',
            'field' => $node->expression->name,
            'raw' => $node->raw,
            'expression' => $node->expression->accept($this),
        ];
    }

    public function visitIf(IfNode $node): mixed
    {
        return [
            'type' => 'if',
            'branches' => array_map(
                function (ConditionalBranch $branch) {
                    return [
                        'condition' => $branch->raw,
                        'expression' => $branch->expression->accept($this),
                        'body' => $this->nodes($branch->body),
                    ];
                },
                $node->branches,
            ),
            'else' => $this->nodes($node->elseBody),
        ];
    }

    public function visitLoop(LoopNode $node): mixed
    {
        return [
            'type' => 'loop',
            'subject' => $node->subject->accept($this),
            'body' => $this->nodes($node->body),
        ];
    }

    public function visitWith(WithNode $node): mixed
    {
        return [
            'type' => 'with',
            'subject' => $node->subject->accept($this),
            'body' => $this->nodes($node->body),
        ];
    }

    public function visitInclude(IncludeNode $node): mixed
    {
        return [
            'type' => 'include',
            'template' => $node->template,
            'args' => $this->nodes($node->args),
        ];
    }

    public function visitComment(CommentNode $node): mixed
    {
        return ['type' => 'comment', 'text' => $node->text];
    }

    public function visitRequire(RequireNode $node): mixed
    {
        return ['type' => 'require', 'keyword' => $node->keyword, 'raw' => $node->raw];
    }

    public function visitCached(CachedNode $node): mixed
    {
        return ['type' => 'cached', 'body' => $this->nodes($node->body)];
    }

    public function visitI18n(I18nNode $node): mixed
    {
        return ['type' => 'i18n', 'raw' => $node->raw];
    }

    public function visitExtension(Node $node): mixed
    {
        $dump = ['type' => 'extension', 'node' => $node::class];

        if ($node instanceof ExtensionNode) {
            $dump['keyword'] = $node->keyword;
            $dump['args'] = $node->args;
        }

        if ($node instanceof BodyContainer) {
            $dump['body'] = $this->nodes($node->getBody());
        }

        return $dump;
    }

    public function visitLookup(LookupNode $node): mixed
    {
        $dump = ['lookup' => $node->name];

        if ($node->scopeHops > 0) {
            $dump['scopeHops'] = $node->scopeHops;
        }

        if ($node->fromTop) {
            $dump['fromTop'] = true;
        }

        if ($node->args !== null) {
            $dump['args'] = $this->nodes($node->args);
        }

        if ($node->accessors !== []) {
            $dump['accessors'] = array_map(
                function ($accessor) {
                    if (is_string($accessor)) {
                        return $accessor;
                    }

                    return $accessor->accept($this);
                },
                $node->accessors,
            );
        }

        return $dump;
    }

    public function visitMethodCall(MethodCall $node): mixed
    {
        return ['call' => $node->name, 'args' => $this->nodes($node->args)];
    }

    public function visitLiteral(LiteralNode $node): mixed
    {
        return ['literal' => $node->value];
    }

    public function visitBinary(BinaryExpression $node): mixed
    {
        return [
            'operator' => $node->operator,
            'left' => $node->left->accept($this),
            'right' => $node->right->accept($this),
        ];
    }

    public function visitUnary(UnaryExpression $node): mixed
    {
        return [
            'operator' => $node->operator,
            'operand' => $node->operand->accept($this),
        ];
    }

}
