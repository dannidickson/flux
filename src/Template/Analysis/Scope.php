<?php

namespace Flux\Template\Analysis;

use Flux\Template\Ast\ScopeOpener;

final class Scope
{

    public const string ROOT = 'root';
    public const string LOOP = ScopeOpener::LOOP;
    public const string WITH = ScopeOpener::WITH;
    public const string INCLUDE = 'include';

    public readonly ?string $class;

    public readonly string $kind;

    public readonly ?string $subject;

    public function __construct(?string $class, string $kind = self::ROOT, ?string $subject = null)
    {
        $this->class = $class;
        $this->kind = $kind;
        $this->subject = $subject;
    }

    public function isOpaque(): bool
    {
        return $this->class === null;
    }

    /** A scope whose class couldn't be worked out, so nothing inside it binds. */
    public static function opaque(string $kind, ?string $subject = null): self
    {
        return new self(null, $kind, $subject);
    }

}
