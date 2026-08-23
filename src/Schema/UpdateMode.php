<?php

namespace Flux\Schema;

/**
 * How bound field changes are applied in the preview.
 *
 * Stored per field in `flux_fields` as `UpdateMode` (map form); a plain string entry implies {@see self::TEXT}.
 */
final class UpdateMode
{

    public const string TEXT = 'textUpdate';
    public const string TEMPLATE = 'templateUpdate';

    /** Reserved: structural patch of the bound element, not yet implemented. */
    public const string PATCH = 'patchUpdate';

}
