<?php

namespace Flux\Template\Ast\Expression;

use Flux\Template\Ast\Node;

/**
 * Base class for expression nodes, the value-producing side of the grammar:
 * variable output, method-call arguments, and (later) `if` conditions.
 */
abstract class Expression extends Node
{

}
