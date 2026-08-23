<?php

namespace Flux\Template\Parser;

use Flux\Template\Ast\Expression\Expression;
use Flux\Template\Ast\Expression\LiteralNode;
use Flux\Template\Ast\Node;
use Flux\Template\Ast\Node\CachedNode;
use Flux\Template\Ast\Node\CommentNode;
use Flux\Template\Ast\Node\ConditionalBranch;
use Flux\Template\Ast\Node\I18nNode;
use Flux\Template\Ast\Node\IfNode;
use Flux\Template\Ast\Node\IncludeNode;
use Flux\Template\Ast\Node\LoopNode;
use Flux\Template\Ast\Node\RequireNode;
use Flux\Template\Ast\Node\TemplateNode;
use Flux\Template\Ast\Node\TextNode;
use Flux\Template\Ast\Node\VariableNode;
use Flux\Template\Ast\Node\WithNode;
use Flux\Template\Lexer\Lexer;
use Flux\Template\Lexer\TokenStream;
use Flux\Template\Lexer\TokenType;
use RuntimeException;

/**
 * Turns a lexed template into a {@see TemplateNode} AST via recursive descent:
 * `<%` tags dispatch to per-construct parsers whose bodies recurse until their
 * matching close tag. Variable expressions are delegated to {@see ExpressionParser}.
 */
final class Parser
{

    private readonly string $source;
    private readonly TokenStream $stream;
    private readonly ExpressionParser $expressions;
    private readonly TagHandlerRegistry $tags;

    public function __construct(string $source, ?TagHandlerRegistry $tags = null)
    {
        $this->source = $source;
        $this->stream = Lexer::stream($source);
        $this->expressions = new ExpressionParser();
        $this->tags = $tags ?? new TagHandlerRegistry();
    }

    /**
     * Parse a template source string straight into its AST.
     * Pass a {@see TagHandlerRegistry} to recognise custom `<% ... %>` constructs.
     */
    public static function parse(string $source, ?TagHandlerRegistry $tags = null): TemplateNode
    {
        return (new self($source, $tags))->run();
    }

    public function run(): TemplateNode
    {
        return new TemplateNode($this->parseNodes());
    }

    /**
     * Collect nodes until EOF or until the current tag is one of $stopTags
     * (which is left unconsumed for the caller to handle).
     *
     * @param string[] $stopTags block-terminating keywords, e.g. ['end_loop']
     * @return Node[]
     */
    private function parseNodes(array $stopTags = []): array
    {
        $nodes = [];

        while (!$this->stream->isEof()) {
            $token = $this->stream->current();

            if ($token->is(TokenType::TagOpen)) {
                if (in_array($this->peekTagKeyword(), $stopTags, true)) {
                    break;
                }

                $nodes[] = $this->parseTag();

                continue;
            }

            if ($token->is(TokenType::Comment)) {
                $nodes[] = new CommentNode($token->value);
                $this->stream->next();

                continue;
            }

            if ($token->is(TokenType::Dollar) || $token->is(TokenType::LBrace)) {
                $nodes[] = $this->parseVariable();

                continue;
            }

            // Text (and, defensively, any stray token in the DATA stream) is
            // passed through verbatim so nothing is silently dropped.
            $nodes[] = new TextNode($token->value, $token->offset);
            $this->stream->next();
        }

        return $nodes;
    }

    private function parseVariable(): VariableNode
    {
        $start = $this->stream->current()->offset;
        $lookup = $this->expressions->parse($this->stream);
        $end = $this->stream->current()->offset;

        $raw = substr($this->source, $start, $end - $start);

        return new VariableNode($lookup, $raw, $start);
    }

    /**
     * Parse a `<% ... %>` construct. Dispatches on the tag keyword; the opening
     * `<%` and keyword name are consumed here, each handler finishes the tag.
     */
    private function parseTag(): Node
    {
        $this->stream->expect(TokenType::TagOpen);
        $keyword = $this->stream->expect(TokenType::Name)->value;

        return match ($keyword) {
            'if' => $this->parseIf(),
            'loop' => $this->parseLoop(),
            'with' => $this->parseWith(),
            'include' => $this->parseInclude(),
            'cached', 'cache' => $this->parseCached(),
            't' => new I18nNode($this->consumeTagBody()),
            default => $this->parseCustomOrPassThrough($keyword),
        };
    }

    /**
     * A non-built-in keyword goes to a registered {@see TagHandler} if one claims it,
     * otherwise it becomes a pass-through node so an unknown tag never breaks the parse.
     */
    private function parseCustomOrPassThrough(string $keyword): Node
    {
        $handler = $this->tags->get($keyword);

        if ($handler === null) {
            return new RequireNode($keyword, $this->consumeTagBody());
        }

        return $handler->parse($this->tagContext());
    }

    /**
     * A {@see TagParseContext} bound to this parser's internals via closures, so
     * handlers can parse args/bodies without those methods being made public.
     */
    private function tagContext(): TagParseContext
    {
        return new TagParseContext(
            $this->stream,
            $this->expressions,
            function (array $stopTags): array {
                return $this->parseNodes($stopTags);
            },
            function (): string {
                return $this->consumeTagBody();
            },
            function (string ...$keywords): void {
                $this->consumeCloseTag(...$keywords);
            },
        );
    }

    private function parseIf(): IfNode
    {
        $branches = [$this->parseConditionalBranch()];

        while ($this->peekTagKeyword() === 'else_if') {
            $this->stream->expect(TokenType::TagOpen);
            $this->stream->expect(TokenType::Name); // else_if
            $branches[] = $this->parseConditionalBranch();
        }

        $elseBody = [];

        if ($this->peekTagKeyword() === 'else') {
            $this->stream->expect(TokenType::TagOpen);
            $this->stream->expect(TokenType::Name); // else
            $this->consumeTagBody();
            $elseBody = $this->parseNodes(['end_if']);
        }

        $this->consumeCloseTag('end_if');

        return new IfNode($branches, $elseBody);
    }

    private function parseConditionalBranch(): ConditionalBranch
    {
        $offset = $this->stream->current()->offset;
        $expression = $this->parseConditionExpression();
        $raw = $this->consumeTagBody($offset);

        return new ConditionalBranch($raw, $expression, $offset, $this->parseNodes(['else_if', 'else', 'end_if']));
    }

    /** A malformed/unsupported condition falls back to an inert literal rather than derailing the parse. */
    private function parseConditionExpression(): Expression
    {
        try {
            return $this->expressions->parseCondition($this->stream);
        } catch (RuntimeException) {
            return new LiteralNode(false);
        }
    }

    private function parseLoop(): LoopNode
    {
        $subject = $this->expressions->parse($this->stream);
        $this->consumeTagBody();
        $body = $this->parseNodes(['end_loop']);
        $this->consumeCloseTag('end_loop');

        return new LoopNode($subject, $body);
    }

    private function parseWith(): WithNode
    {
        $subject = $this->expressions->parse($this->stream);
        $this->consumeTagBody();
        $body = $this->parseNodes(['end_with']);
        $this->consumeCloseTag('end_with');

        return new WithNode($subject, $body);
    }

    private function parseCached(): CachedNode
    {
        $raw = $this->consumeTagBody();
        $body = $this->parseNodes(['end_cached', 'end_cache']);
        $this->consumeCloseTag('end_cached', 'end_cache');

        return new CachedNode($body, $raw);
    }

    /**
     * `<% include Template Key=$Value, Key2=2 %>`: a template name followed by
     * optional `Name=value` arguments (comma-separated).
     */
    private function parseInclude(): IncludeNode
    {
        $template = $this->stream->expect(TokenType::Name)->value;

        $args = [];

        while ($this->stream->current()->is(TokenType::Name) && $this->stream->peek(1)->is(TokenType::Equals)) {
            $key = $this->stream->expect(TokenType::Name)->value;
            $this->stream->expect(TokenType::Equals);
            $args[$key] = $this->expressions->parseValue($this->stream);

            if (!$this->stream->current()->is(TokenType::Comma)) {
                continue;
            }

            $this->stream->next();
        }

        $this->consumeTagBody();

        return new IncludeNode($template, $args);
    }

    /**
     * The keyword of the current `<% keyword %>` tag, or null if the cursor is
     * not on a tag opening.
     */
    private function peekTagKeyword(): ?string
    {
        if (!$this->stream->current()->is(TokenType::TagOpen)) {
            return null;
        }

        $next = $this->stream->peek(1);

        if (!$next->is(TokenType::Name)) {
            return null;
        }

        return $next->value;
    }

    /**
     * Consumes up to and including the tag's closing `%>`, returning the raw text between.
     */
    private function consumeTagBody(?int $start = null): string
    {
        $start ??= $this->stream->current()->offset;

        while (!$this->stream->isEof() && !$this->stream->current()->is(TokenType::TagClose)) {
            $this->stream->next();
        }

        // The cursor now sits on the closing `%>` (or EOF, whose offset is the
        // source length); either marks where the tag body ends.
        $end = $this->stream->current()->offset;

        if ($this->stream->current()->is(TokenType::TagClose)) {
            $this->stream->next();
        }

        return trim(substr($this->source, $start, $end - $start));
    }

    /**
     * Consume a block's closing tag (`<% end_loop %>` etc.). Tolerant of an
     * unterminated block at EOF so one malformed template can't derail a run.
     *
     * @param string ...$keywords accepted close keywords (aliases allowed)
     */
    private function consumeCloseTag(string ...$keywords): void
    {
        if (!in_array($this->peekTagKeyword(), $keywords, true)) {
            return;
        }

        $this->stream->expect(TokenType::TagOpen);
        $this->stream->expect(TokenType::Name); // the end_* keyword
        $this->consumeTagBody();
    }

}
