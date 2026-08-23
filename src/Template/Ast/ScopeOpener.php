<?php

namespace Flux\Template\Ast;

use Flux\Template\Ast\Expression\LookupNode;

/**
 * A node that opens a new scope for its body, like `<% loop %>` / `<% with %>`.
 * The analyzer lifts the body out of the current scope and walks it again against the
 * subject's class, so a block tag needs no analyzer changes. {@see BodyContainer} is
 * the version that keeps its body in the current scope.
 */
interface ScopeOpener
{

    /** The body renders once for each item in the subject. */
    public const string LOOP = 'loop';

    /** The body renders once, against the subject itself. */
    public const string WITH = 'with';

    /** The relation or method the body renders against. */
    public function getSubject(): LookupNode;

    /** Either ScopeOpener::LOOP or ScopeOpener::WITH. */
    public function getScopeKind(): string;

    /** @return Node[] child nodes to process within the new scope */
    public function getBody(): array;

}
