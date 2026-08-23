<?php

namespace Flux\Template\Ast\Node;

use Flux\Template\Ast\Expression\LookupNode;
use Flux\Template\Ast\Node;
use Flux\Template\Ast\NodeVisitor;
use Flux\Template\Ast\ScopeOpener;

/**
 * A `<% loop $Rel %>` block. The analyzer pushes a new scope (the item class of
 * `$subject`) for the body, and emits an item selector plus per-field relation selectors.
 */
final class LoopNode extends Node implements ScopeOpener
{

    /** @param Node[] $body */
    public function __construct(public readonly LookupNode $subject, public readonly array $body = [])
    {
    }

    public function getSubject(): LookupNode
    {
        return $this->subject;
    }

    public function getScopeKind(): string
    {
        return ScopeOpener::LOOP;
    }

    public function getBody(): array
    {
        return $this->body;
    }

    public function accept(NodeVisitor $visitor): mixed
    {
        return $visitor->visitLoop($this);
    }

}
