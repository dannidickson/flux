<?php

namespace Flux\Template\Analysis;

/**
 * The analyzer's scope stack: root DataObject at the bottom, a frame per
 * `<% loop %>` / `<% with %>`. `$Up` / `$Top` read across frames without mutating it.
 */
final class ScopeStack
{

    /** @var Scope[] index 0 = root, last = current */
    private array $scopes;

    public function __construct(Scope $root)
    {
        $this->scopes = [$root];
    }

    public function push(Scope $scope): void
    {
        $this->scopes[] = $scope;
    }

    public function pop(): Scope
    {
        // Never pop the root frame off the bottom.
        if (count($this->scopes) === 1) {
            return $this->current();
        }

        return array_pop($this->scopes);
    }

    public function current(): Scope
    {
        return $this->scopes[count($this->scopes) - 1];
    }

    public function top(): Scope
    {
        return $this->scopes[0];
    }

    public function depth(): int
    {
        return count($this->scopes);
    }

    /**
     * The frame $hops levels out (`$Up` = 1). Reading past the root yields an opaque
     * frame rather than wrapping around.
     */
    public function up(int $hops): Scope
    {
        $index = count($this->scopes) - 1 - $hops;

        if ($index < 0) {
            return Scope::opaque(Scope::ROOT);
        }

        return $this->scopes[$index];
    }

    /**
     * Resolve the frame a lookup should read against, honouring its scope info:
     * `$Top` → root, `$Up`(.Up)* → N frames out, otherwise the current frame.
     */
    public function resolveFor(int $scopeHops, bool $fromTop): Scope
    {
        if ($fromTop) {
            return $this->top();
        }

        if ($scopeHops > 0) {
            return $this->up($scopeHops);
        }

        return $this->current();
    }

}
