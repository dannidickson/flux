<?php

namespace Flux\Template\Analysis;

use Flux\Schema\UpdateMode;

/**
 * A resolved field → selector binding. $selector is empty for a condition-only field;
 * $scope is `page` or the enclosing loop/with's relation name.
 */
final class FieldBinding
{

    public const string SCOPE_PAGE = 'page';

    public readonly string $field;

    public readonly string $selector;

    public readonly string $class;

    public readonly string $scope;

    public readonly string $updateMode;

    public readonly bool $isConditional;

    public function __construct(
        string $field,
        string $selector,
        string $class,
        string $scope = self::SCOPE_PAGE,
        string $updateMode = UpdateMode::TEXT,
        bool $isConditional = false,
    ) {
        $this->field = $field;
        $this->selector = $selector;
        $this->class = $class;
        $this->scope = $scope;
        $this->updateMode = $updateMode;
        $this->isConditional = $isConditional;
    }

}
