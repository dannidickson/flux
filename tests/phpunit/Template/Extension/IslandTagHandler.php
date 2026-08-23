<?php

namespace Flux\Tests\Template\Extension;

use Flux\Template\Ast\Node;
use Flux\Template\Ast\Node\ExtensionNode;
use Flux\Template\Lexer\TokenType;
use Flux\Template\Parser\TagHandler;
use Flux\Template\Parser\TagParseContext;

/**
 * @todo @ignore
 *
 * Test if the Parser can implement custom tag like
 * `<% island 'server-name' %>…<% end_island %>` block.
 */
final class IslandTagHandler implements TagHandler
{

    public function parse(TagParseContext $context): Node
    {
        $server = null;

        if ($context->stream()->current()->is(TokenType::Str)) {
            $server = $context->stream()->next()->value;
        }

        $context->finishTag();

        $body = $context->parseBody(['end_island']);
        $context->closeTag('end_island');

        return new ExtensionNode('island', ['server' => $server], $body);
    }

}
