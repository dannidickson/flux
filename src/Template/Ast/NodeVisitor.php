<?php

namespace Flux\Template\Ast;

use Flux\Template\Ast\Expression\BinaryExpression;
use Flux\Template\Ast\Expression\LiteralNode;
use Flux\Template\Ast\Expression\LookupNode;
use Flux\Template\Ast\Expression\MethodCall;
use Flux\Template\Ast\Expression\UnaryExpression;
use Flux\Template\Ast\Node\CachedNode;
use Flux\Template\Ast\Node\CommentNode;
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
 * Visitor over an AST, one method per built-in node kind.
 * Custom ExtensionNodes go to visitExtension() instead.
 *
 * @template T
 */
interface NodeVisitor
{

    /**
     * Fallback for any node outside the built-in set
     *
     * @return T
     */
    public function visitExtension(Node $node): mixed;

    // Structure / statements.

    /** @return T */
    public function visitTemplate(TemplateNode $node): mixed;

    /** @return T */
    public function visitText(TextNode $node): mixed;

    /** @return T */
    public function visitVariable(VariableNode $node): mixed;

    /** @return T */
    public function visitIf(IfNode $node): mixed;

    /** @return T */
    public function visitLoop(LoopNode $node): mixed;

    /** @return T */
    public function visitWith(WithNode $node): mixed;

    /** @return T */
    public function visitInclude(IncludeNode $node): mixed;

    /** @return T */
    public function visitComment(CommentNode $node): mixed;

    /** @return T */
    public function visitRequire(RequireNode $node): mixed;

    /** @return T */
    public function visitCached(CachedNode $node): mixed;

    /** @return T */
    public function visitI18n(I18nNode $node): mixed;

    // Expressions.

    /** @return T */
    public function visitLookup(LookupNode $node): mixed;

    /** @return T */
    public function visitMethodCall(MethodCall $node): mixed;

    /** @return T */
    public function visitLiteral(LiteralNode $node): mixed;

    /** @return T */
    public function visitBinary(BinaryExpression $node): mixed;

    /** @return T */
    public function visitUnary(UnaryExpression $node): mixed;

}
