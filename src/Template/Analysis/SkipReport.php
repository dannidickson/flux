<?php

namespace Flux\Template\Analysis;

/**
 * A binding candidate the analyzer deliberately dropped, with a reason.
 */
final class SkipReport
{

    /** Variable shares its element with other content, similar to 'no unique selector'. */
    public const string NOT_SOLE_CONTENT = 'not-sole-content';

    /** Embedded in an element attribute but its carrying element couldn't be resolved. */
    public const string ATTRIBUTE = 'attribute';

    /** Its element has no class and no classed ancestor to qualify. */
    public const string NO_UNIQUE_SELECTOR = 'no-unique-selector';

    /** Inside a `loop`/`with` whose class couldn't be resolved. */
    public const string OPAQUE_SCOPE = 'opaque-scope';

    /** Name isn't a `db` field or `has_one` on the resolved class. */
    public const string UNKNOWN_FIELD = 'unknown-field';

    /** Accessor chain traverses into a related object (`$Author.Name`), not the base field itself. */
    public const string RELATION_ACCESSOR = 'relation-accessor';

    /** `<% include %>` target not found on disk. */
    public const string INCLUDE_NOT_FOUND = 'include-not-found';

    public readonly string $field;

    public readonly string $reason;

    public readonly string $detail;

    public readonly int $offset;

    public function __construct(string $field, string $reason, string $detail = '', int $offset = 0)
    {
        $this->field = $field;
        $this->reason = $reason;
        $this->detail = $detail;
        $this->offset = $offset;
    }

}
