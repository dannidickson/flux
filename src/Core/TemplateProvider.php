<?php

namespace Flux\Core;

use SilverStripe\View\TemplateGlobalProvider;

class FluxTemplateProvider implements TemplateGlobalProvider
{
    /**
     * @return array
     */
    public static function get_template_global_variables(): array
    {
        return [
            "SetFluxAttributes" => [
                "method" => "SetFluxAttributes",
                "casting" => "HTMLText",
            ],
        ];
    }

    /**
     * Adds flux attributes to the template
     *
     * @param array<string> $attributes
     * @return string
     */
    public static function SetFluxAttributes(...$attributes): string
    {
        $result = [];
        foreach ($attributes as $attribute) {
            if (!str_contains($attribute, ":")) {
                continue;
            }

            $attributeCollection = explode(":", $attribute);

            $key = $attributeCollection[0];
            $value = $attributeCollection[1];

            if (!str_contains($key, "fx")) {
                $key = sprintf("fx-%s", $key);
            }

            $result[] = sprintf('%s="%s"', $key, $value);
        }

        return implode(" ", $result);
    }
}
