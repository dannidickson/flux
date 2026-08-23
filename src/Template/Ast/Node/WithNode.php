<?php

namespace Flux\Template\Ast\Node;

use Flux\Template\Ast\Expression\LookupNode;
use Flux\Template\Ast\Node;
use Flux\Template\Ast\NodeVisitor;
use Flux\Template\Ast\ScopeOpener;

/**
 * A `<% with $Rel %>` block: render the body against a single related object
 * (`has_one` / method return). The analyzer pushes a scope of the subject's class
 * for the duration of the body.
 */
final class WithNode extends Node implements ScopeOpener
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
        return ScopeOpener::WITH;
    }

    public function getBody(): array
    {
        return $this->body;
    }

    public function accept(NodeVisitor $visitor): mixed
    {
        return $visitor->visitWith($this);
    }

}
