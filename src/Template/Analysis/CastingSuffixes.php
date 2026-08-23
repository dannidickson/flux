<?php

namespace Flux\Template\Analysis;

use Flux\Template\Ast\Expression\LookupNode;
use Flux\Template\Ast\Expression\MethodCall;

/**
 * Tells a formatting chain (`$Price.Nice`) apart from a traversal into a related
 * object (`$Author.Name`) we use the first part to bind the base field, and skip the second.
 */
final class CastingSuffixes
{

    /**
     * Limited to well-known DBField formatters on purpose, so a real relation property is
     * never mistaken for a suffix. Compared case-insensitively.
     */
    private const array KNOWN = [
        // Escaping / output context.
        'XML', 'RAW', 'HTML', 'JS', 'ATT', 'CDATA', 'RAWURLATT', 'URLATT',
        'EscapeXML', 'ProcessedRAW', 'ForTemplate', 'NoHTML', 'Plain', 'RTF',
        // Text shaping.
        'LimitCharacters', 'LimitCharactersToClosestWord', 'LimitWordCount',
        'LimitSentences', 'Summary', 'BigSummary', 'ContextSummary',
        'FirstParagraph', 'FirstSentence', 'Ellipsis', 'Trim',
        'LowerCase', 'UpperCase', 'Lower', 'Upper', 'Initial', 'Capitalize',
        // Numbers / currency.
        'Nice', 'NiceRound', 'Round', 'Int', 'Absolute', 'Currency', 'Bytes',
        // Dates / times.
        'Ago', 'Date', 'Time', 'DateTime', 'Long', 'Full', 'Short', 'Format',
        'FormatFromSettings', 'Rfc822', 'Rfc2822', 'Rfc3339', 'Year', 'Month',
        'ShortMonth', 'DayOfMonth', 'CalendarDay',
        // Misc value accessors.
        'Value', 'URL', 'AbsoluteURL', 'Link', 'AbsoluteLink',
    ];

    /** @var array<string, true> uppercased KNOWN, for case-insensitive lookup */
    private static ?array $knownUpper = null;

    public function isKnown(string $name): bool
    {
        self::$knownUpper ??= array_fill_keys(array_map('strtoupper', self::KNOWN), true);

        return isset(self::$knownUpper[strtoupper($name)]);
    }

    /**
     * True when the lookup still outputs the base field, just reformatted.
     */
    public function isPureFormatting(LookupNode $lookup): bool
    {
        foreach ($lookup->accessors as $accessor) {
            $name = $accessor;

            if ($accessor instanceof MethodCall) {
                $name = $accessor->name;
            }

            if (!$this->isKnown($name)) {
                return false;
            }
        }

        return true;
    }

}
