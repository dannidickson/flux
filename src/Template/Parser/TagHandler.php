<?php

namespace Flux\Template\Parser;

use Flux\Template\Ast\Node;

/**
 * Parses a custom `<% ... %>` tag into an AST node. Register one on a
 * {@see TagHandlerRegistry} to add a construct; built-in keywords always win.
 */
interface TagHandler
{

    public function parse(TagParseContext $context): Node;

}
