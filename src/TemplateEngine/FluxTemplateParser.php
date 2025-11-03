<?php

namespace Flux\TemplateEngine;

use SilverStripe\TemplateEngine\SSTemplateParser;

/**
 * Extended template parser that adds dependency tracking markers
 * to template blocks for partial rendering support.
 *
 * Wraps <% loop %> and <% if %> blocks with HTML comment markers containing
 * information about which fields they depend on.
 *
 * Only used in API context, never registered globally.
 */
class FluxTemplateParser extends SSTemplateParser
{
    /**
     * Counter for generating unique block IDs
     * @var int
     */
    protected static $blockCounter = 0;

    /**
     * Map of block IDs to their dependencies
     * @var array
     */
    protected $dependencyMap = [];

    /**
     * Reset the block counter (useful for testing)
     */
    public static function resetBlockCounter(): void
    {
        self::$blockCounter = 0;
    }

    /**
     * Get the dependency map
     *
     * @todo We technically could use this to remove the need for a developer defining `flux_fields` or something like that
     * At the moment we are only tracking if / loop blocks
     *
     * @return array
     */
    public function getDependencyMap(): array
    {
        return $this->dependencyMap;
    }

    /**
     * Override to wrap Loop blocks with tracking markers
     */
    public function ClosedBlock_Handle_Loop(&$res)
    {
        $originalPhp = parent::ClosedBlock_Handle_Loop($res);

        $dependencies = [];

        if (isset($res['Arguments'])) {
            $dependencies = $this->extractDependenciesFromArguments($res['Arguments']);
        }

        if (empty($dependencies) && isset($res['Argument'])) {
            $dependencies = $this->extractDependenciesFromArguments([$res['Argument']]);
        }

        if (empty($dependencies) && isset($res['php'])) {
            $dependencies = $this->extractFieldsFromPhp($res['php']);
        }

        $blockId = 'flux-block-' . (++self::$blockCounter);

        $this->dependencyMap[$blockId] = [
            'type' => 'loop',
            'dependencies' => $dependencies,
        ];

        return $this->wrapWithMarker($originalPhp, $blockId, 'loop', $dependencies);
    }

    /**
     * Override If_IfPart to wrap content inside the if branch
     */
    public function If_IfPart(&$res, $sub)
    {
        $conditionDeps = $this->extractDependenciesFromIfArgument($sub['IfArgument'] ?? []);

        $templatePhp = isset($sub['Template']) ? $sub['Template']['php'] : '';

        $contentDeps = $this->extractFieldsFromPhp($templatePhp);

        $dependencies = array_unique(array_merge($conditionDeps, $contentDeps));

        $blockId = 'flux-block-' . (++self::$blockCounter);

        $this->dependencyMap[$blockId] = [
            'type' => 'if',
            'dependencies' => $dependencies,
        ];

        $wrappedContent = $this->wrapWithMarker($templatePhp, $blockId, 'if', $dependencies);

        $res['php'] =
            'if (' . $sub['IfArgument']['php'] . ') { ' . PHP_EOL .
                $wrappedContent . PHP_EOL .
            '}';
    }

    /**
     * Override If_ElseIfPart to wrap content inside the elseif branch
     */
    public function If_ElseIfPart(&$res, $sub)
    {
        $conditionDeps = $this->extractDependenciesFromIfArgument($sub['IfArgument'] ?? []);

        $templatePhp = isset($sub['Template']) ? $sub['Template']['php'] : '';

        $contentDeps = $this->extractFieldsFromPhp($templatePhp);

        $dependencies = array_unique(array_merge($conditionDeps, $contentDeps));

        $blockId = 'flux-block-' . (++self::$blockCounter);

        $this->dependencyMap[$blockId] = [
            'type' => 'elseif',
            'dependencies' => $dependencies,
        ];

        $wrappedContent = $this->wrapWithMarker($templatePhp, $blockId, 'elseif', $dependencies);

        $res['php'] .=
            'else if (' . $sub['IfArgument']['php'] . ') { ' . PHP_EOL .
                $wrappedContent . PHP_EOL .
            '}';
    }

    /**
     * Override If_ElsePart to wrap content inside the else branch
     */
    public function If_ElsePart(&$res, $sub)
    {
        $templatePhp = isset($sub['Template']) ? $sub['Template']['php'] : '';

        $dependencies = $this->extractFieldsFromPhp($templatePhp);

        $blockId = 'flux-block-' . (++self::$blockCounter);

        $this->dependencyMap[$blockId] = [
            'type' => 'else',
            'dependencies' => $dependencies,
        ];

        $wrappedContent = $this->wrapWithMarker($templatePhp, $blockId, 'else', $dependencies);

        $res['php'] .=
            'else { ' . PHP_EOL .
                $wrappedContent . PHP_EOL .
            '}';
    }

    /**
     * Wrap PHP output code with HTML comment markers
     * Format: <!-- FLUX_START::type:field -->...<!-- FLUX_END::type:field -->
     */
    protected function wrapWithMarker(string $php, string $blockId, string $type, array $dependencies): string
    {
        $primaryField = !empty($dependencies) ? $dependencies[0] : '';

        $openMarker = sprintf(
            "\$val .= '<!-- FLUX_START::%s:%s -->';",
            $type,
            $primaryField
        );

        $closeMarker = sprintf(
            "\$val .= '<!-- FLUX_END::%s:%s -->';",
            $type,
            $primaryField
        );

        return $openMarker . PHP_EOL . $php . PHP_EOL . $closeMarker;
    }

    /**
     * Extract field dependencies from block arguments
     *
     * @param array $arguments Array of argument data from parser
     * @return array List of field names this block depends on
     */
    protected function extractDependenciesFromArguments(array $arguments): array
    {
        $dependencies = [];

        foreach ($arguments as $arg) {
            $phpCode = $arg['php'] ?? $arg['lookup_php'] ?? '';

            $deps = $this->extractFieldsFromPhp($phpCode);
            $dependencies = array_merge($dependencies, $deps);
        }

        return array_unique(array_filter($dependencies));
    }

    /**
     * Extract field dependencies from If argument condition
     *
     * @param array $ifArgument IfArgument data from parser
     * @return array List of field names this condition depends on
     */
    protected function extractDependenciesFromIfArgument(array $ifArgument): array
    {
        $phpCode = $ifArgument['php'] ?? '';
        return $this->extractFieldsFromPhp($phpCode);
    }

    /**
     * Extract field names from PHP code generated by the parser
     *
     * Looks for patterns like:
     * - hasValue('FieldName', [])
     * - scopeToIntermediateValue('FieldName', [])
     * - getOutputValue('FieldName', [])
     * - $scope->getField("FieldName")
     * - $scope->FieldName
     * - $item->FieldName
     *
     * @param string $phpCode PHP code to analyze
     * @return array List of field names found
     */
    protected function extractFieldsFromPhp(string $phpCode): array
    {
        $fields = [];

        //  hasValue('FieldName', [])
        if (preg_match_all('/hasValue\(["\']([^"\']+)["\']/', $phpCode, $matches)) {
            $fields = array_merge($fields, $matches[1]);
        }

        // scopeToIntermediateValue('FieldName', [])
        if (preg_match_all('/scopeToIntermediateValue\(["\']([^"\']+)["\']/', $phpCode, $matches)) {
            $fields = array_merge($fields, $matches[1]);
        }

        // getOutputValue('FieldName', [])
        if (preg_match_all('/getOutputValue\(["\']([^"\']+)["\']/', $phpCode, $matches)) {
            $fields = array_merge($fields, $matches[1]);
        }

        // foreach ($scope->FieldName as ...)
        if (preg_match_all('/foreach\s*\(\s*\$scope->([A-Z][a-zA-Z0-9_]*)/i', $phpCode, $matches)) {
            $fields = array_merge($fields, $matches[1]);
        }

        // : $scope->getField("FieldName") or $scope->getField('FieldName')
        if (preg_match_all('/\$scope->getField\(["\']([^"\']+)["\']\)/', $phpCode, $matches)) {
            $fields = array_merge($fields, $matches[1]);
        }

        // : $scope->FieldName)
        if (preg_match_all('/\$scope->([A-Z][a-zA-Z0-9_]*)/', $phpCode, $matches)) {
            $fields = array_merge($fields, $matches[1]);
        }

        // Method calls that are getters
        // Looking for patterns like $scope->obj("Title")
        if (preg_match_all('/->obj\(["\']([^"\']+)["\']\)/', $phpCode, $matches)) {
            $fields = array_merge($fields, $matches[1]);
        }

        return array_unique(array_filter($fields));
    }
}
