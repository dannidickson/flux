<?php

namespace Flux\Template\Ast;

/**
 * A node whose body stays in the current scope, like `<% cached %>` or a custom block tag.
 * The analyzer walks the body where it sits, so a block tag needs no analyzer changes.
 * {@see ScopeOpener} is the version that opens a new scope for its body.
 */
interface BodyContainer
{

    /** @return Node[] child nodes to process in the current scope */
    public function getBody(): array;

}
