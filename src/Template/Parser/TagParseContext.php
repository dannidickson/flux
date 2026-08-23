<?php

namespace Flux\Template\Parser;

use Flux\Template\Ast\Expression\LookupNode;
use Flux\Template\Ast\Node;
use Flux\Template\Lexer\TokenStream;

/**
 * Experiemental feature to see how could a custom tag like '<% island %>' work
 * This could work outside of the parser intals
 *
 * @todo not really required as this was just an experiemental feature to see how to implement custom tags
 */
class TagParseContext
{

    private readonly TokenStream $stream;
    private readonly ExpressionParser $expressions;

    /** @param callable(string[]): Node[] $parseBody parse nodes until a stop keyword */
    private readonly mixed $parseBody;

    /** @param callable(): string $finishTag consume to `%>`, return raw body text */
    private readonly mixed $finishTag;

    /** @param callable(string ...$k): void $closeTag consume a matching close tag */
    private readonly mixed $closeTag;

    public function __construct(
        TokenStream $stream,
        ExpressionParser $expressions,
        mixed $parseBody,
        mixed $finishTag,
        mixed $closeTag,
    ) {
        $this->stream = $stream;
        $this->expressions = $expressions;
        $this->parseBody = $parseBody;
        $this->finishTag = $finishTag;
        $this->closeTag = $closeTag;
    }

    public function stream(): TokenStream
    {
        return $this->stream;
    }

    public function expressions(): ExpressionParser
    {
        return $this->expressions;
    }

    /**
     * Parse the next variable expression in the tag (`$Foo.Bar`), advancing past it.
     */
    public function parseExpression(): LookupNode
    {
        return $this->expressions->parse($this->stream);
    }

    /**
     * Parse child nodes until one of $stopTags is the current tag (left
     * unconsumed). Pair with {@see closeTag()} to finish a block construct.
     *
     * @param string[] $stopTags e.g. ['end_island']
     * @return Node[]
     */
    public function parseBody(array $stopTags): array
    {
        return ($this->parseBody)($stopTags);
    }

    /**
     * Consume the remainder of the current tag up to and including `%>`,
     * returning the trimmed raw text between the cursor and `%>`.
     */
    public function finishTag(): string
    {
        return ($this->finishTag)();
    }

    /**
     * Consume a block's closing tag if present (e.g. `<% end_island %>`).
     */
    public function closeTag(string ...$keywords): void
    {
        ($this->closeTag)(...$keywords);
    }

}
