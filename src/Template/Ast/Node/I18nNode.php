<?php

namespace Flux\Template\Ast\Node;

use Flux\Template\Ast\Node;
use Flux\Template\Ast\NodeVisitor;

/**
 * An `<%t Namespace.Entity 'Default' %>` translation tag. Its output is a localised
 * string, never a DataObject field, so analysis ignores it.
 */
final class I18nNode extends Node
{

    public function __construct(public readonly string $raw)
    {
    }

    public function accept(NodeVisitor $visitor): mixed
    {
        return $visitor->visitI18n($this);
    }

}
