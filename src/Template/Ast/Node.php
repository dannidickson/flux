<?php

namespace Flux\Template\Ast;

/**
 * Base class for every AST node. Double-dispatch via {@see NodeVisitor} keeps the shape
 * of a rendering engine's AST, so a compiler could be added later.
 */
abstract class Node
{

    /** Dispatch to the visitor method for this node's kind. */
    abstract public function accept(NodeVisitor $visitor): mixed;

}
