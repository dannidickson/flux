<?php

namespace Flux\Dev;

use DOMDocument;
use DOMElement;
use DOMText;
use DOMXPath;
use Flux\Core\Configuration;
use SilverStripe\Core\ClassInfo;
use SilverStripe\Core\Config\Config;
use SilverStripe\Core\Injector\Injector;
use SilverStripe\Core\Path;
use SilverStripe\Dev\Command\DevCommand;
use SilverStripe\Forms\DropdownField;
use SilverStripe\Forms\FormField;
use SilverStripe\ORM\DataObject;
use SilverStripe\PolyExecution\PolyOutput;
use SilverStripe\View\SSViewer;
use SilverStripe\View\ThemeResourceLoader;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Yaml\Yaml;

/**
 * Gathers the templates and DataObjects to auto-generate configuration as a YAML file.
 * sake flux:generate-config
 *
 * Note this is some old code converted from Go into PHP and improved upon.
 */
class FluxGenerateConfigTask extends DevCommand
{
    protected static string $commandName = 'flux:generate-config';

    protected string $title = 'Generate Flux Field Config';

    protected static string $description = 'Analyses templates and DataObjects to generate flux_fields YAML configuration.';

    public function getTitle(): string
    {
        return $this->title;
    }

    protected function getHeading(): string
    {
        return $this->title;
    }

    private const PATTERN_SS_VAR = '/\$(\w+)(?:\([^)]*\))?(?:\.\w+)*/';
    private const PATTERN_SS_CONTROL = '/<%\s*(if|else_if|end_if|loop|end_loop|with|end_with|require|include)\b[^%]*%>/';
    private const PATTERN_ATTR_VAR = '/\w+="[^"]*\$\w+[^"]*"/s';
    private const PATTERN_SS_LOOP = '/<%\s*loop\s+\$(\w+)\s*%>(.*?)<%\s*end_loop\s*%>/s';
    private const PATTERN_SS_WITH = '/<%\s*with\s+\$(\w+)\s*%>(.*?)<%\s*end_with\s*%>/s';
    private const PATTERN_DYNAMIC_OPEN_TAG = '/<\$\w+/';
    private const PATTERN_DYNAMIC_CLOSE_TAG = '/<\/\$\w+>/';

    public function getOptions(): array
    {
        return [
            new InputOption(
                'output',
                'o',
                InputOption::VALUE_REQUIRED,
                'Output path for the generated YAML file',
                'app/_config/flux-fields.yml',
            ),
            new InputOption(
                'dry-run',
                null,
                InputOption::VALUE_NONE,
                'Print the generated config without writing to disk',
            ),
        ];
    }

    protected function execute(InputInterface $input, PolyOutput $output): int
    {
        $config = [];

        foreach ($this->getFluxDataObjects() as $className => $templates) {
            $result = $this->getFluxInfoForClass($className, $templates);
            if ($result) {
                $config[$className] = $result;
            }
        }

        if (empty($config)) {
            $output->writeln('No flux DataObjects with templates found.');
            return Command::SUCCESS;
        }

        if (!$input->getOption('dry-run')) {
            $outputPath = BASE_PATH . '/' . $input->getOption('output');
            file_put_contents($outputPath, Yaml::dump($config, 6, 2));
            $output->writeln("Generated: {$outputPath}");
            $output->writeln('');
        }

        foreach ($config as $className => $classConfig) {
            $output->writeln(sprintf('Writing config for %s', $className));
        }

        return Command::SUCCESS;
    }

    private function getFluxDataObjects(): array
    {
        $classes = [];
        $excluded = Configuration::config()->get('excluded_classes') ?? [];

        foreach (ClassInfo::subclassesFor(DataObject::class, false) as $class) {
            if (in_array($class, $excluded) || empty(Config::inst()->get($class, 'db'))) {
                continue;
            }

            $templates = $this->findTemplatesForClass($class);
            if (!empty($templates)) {
                $classes[$class] = $templates;
            }
        }

        return $classes;
    }

    private function findTemplatesForClass(string $className): array
    {
        $themePaths = ThemeResourceLoader::inst()->getThemePaths(SSViewer::get_themes());
        $baseDir = ThemeResourceLoader::inst()->getBase();
        $candidates = SSViewer::get_templates_by_class($className, '', DataObject::class);
        $found = [];

        foreach ($candidates as $candidate) {
            $templateList = is_array($candidate)
                ? (array_key_exists('templates', $candidate) ? $candidate['templates'] : $candidate)
                : [$candidate];

            $type = is_array($candidate) ? ($candidate['type'] ?? '') : '';

            foreach ($templateList as $template) {
                if (is_array($template)) {
                    continue;
                }

                $template = str_replace('\\', '/', $template);
                $parts = explode('/', $template);
                $tail = array_pop($parts);
                $head = implode('/', $parts);

                foreach ($themePaths as $themePath) {
                    $path = Path::join($baseDir, $themePath, 'templates', $head, $type, $tail) . '.ss';
                    if (file_exists($path)) {
                        $found[] = $path;
                    }

                    $layoutPath = Path::join($baseDir, $themePath, 'templates', $head, 'Layout', $tail) . '.ss';
                    if (file_exists($layoutPath)) {
                        $found[] = $layoutPath;
                    }
                }
            }
        }

        return array_unique($found);
    }

    private function getFluxInfoForClass(string $className, array $templates): ?array
    {
        $config = Config::inst();

        $db = $config->get($className, 'db') ?? [];
        $hasOne = $config->get($className, 'has_one') ?? [];
        $hasMany = $config->get($className, 'has_many') ?? [];
        $manyMany = $config->get($className, 'many_many') ?? [];

        $allFieldNames = array_unique(array_merge(array_keys($db), array_keys($hasOne)));
        $relations = array_merge($hasMany, $manyMany);

        $allAttributeFields = [];
        $allFieldResults = [];
        $allLoopResults = [];

        foreach ($templates as $templatePath) {
            $templateContent = file_get_contents($templatePath);
            if (!$templateContent) {
                continue;
            }

            $allAttributeFields = array_merge($allAttributeFields, $this->findAttributeFields($templateContent));
            $allLoopResults = array_merge($allLoopResults, $this->extractLoopBlocks($templateContent, $relations));

            $resolved = $this->resolveIncludes($templateContent);
            $html = $this->preProcess($this->stripScopedBlocks($resolved));
            $allFieldResults = array_merge($allFieldResults, $this->parseAndWalk($html, $allFieldNames));
        }

        $allAttributeFields = array_unique($allAttributeFields);

        $fluxFields = [];
        $skipped = [];

        foreach ($allFieldResults as $fieldName => $result) {
            if (!array_key_exists($fieldName, $db) && !array_key_exists($fieldName, $hasOne)) {
                continue;
            }

            if (in_array($fieldName, $allAttributeFields)) {
                $skipped[$fieldName] = 'attribute';
                continue;
            }

            if (!empty($result['selector'])) {
                $fluxFields[$fieldName] = $result['selector'];
            }
        }

        $fluxFieldTypes = $this->buildFieldTypes($className, $db, $hasOne, $fluxFields);
        $fluxRelationFields = $this->buildRelationFields($allLoopResults);

        return array_filter([
            'flux_fields' => $fluxFields ?: null,
            'flux_fieldtypes' => $fluxFieldTypes ?: null,
            'flux_relation_fields' => $fluxRelationFields ?: null,
            '_skipped' => $skipped ?: null,
        ]) ?: null;
    }

    private function findAttributeFields(string $template): array
    {
        preg_match_all(self::PATTERN_ATTR_VAR, $template, $matches);
        $fields = [];
        foreach ($matches[0] as $attr) {
            preg_match_all('/\$(\w+)/', $attr, $varMatches);
            array_push($fields, ...$varMatches[1]);
        }
        return $fields;
    }

    // Replaces <% include Name %> tags with the partial content so its variables
    // are visible in the parent class scope.
    private function resolveIncludes(string $template): string
    {
        return preg_replace_callback(
            '/<%\s*include\s+(\w+)[^%]*%>/i',
            fn(array $m) => $this->findIncludeTemplate($m[1]) ?? '',
            $template,
        ) ?? $template;
    }

    private function findIncludeTemplate(string $name): ?string
    {
        $themePaths = ThemeResourceLoader::inst()->getThemePaths(SSViewer::get_themes());
        $baseDir = ThemeResourceLoader::inst()->getBase();

        foreach ($themePaths as $themePath) {
            $path = Path::join($baseDir, $themePath, 'templates', 'Includes', $name) . '.ss';
            if (file_exists($path)) {
                return file_get_contents($path) ?: null;
            }
        }

        return null;
    }

    private function stripScopedBlocks(string $template): string
    {
        $result = preg_replace(self::PATTERN_SS_LOOP, '', $template) ?? $template;
        return preg_replace(self::PATTERN_SS_WITH, '', $result) ?? $result;
    }

    /**
     * Converts templates into HTML for parsing
     * Replace $Variables with placeholders to avoid bad HTML
     */
    private function preProcess(string $template): string
    {
        $html = preg_replace(self::PATTERN_SS_CONTROL, '', $template);
        $html = preg_replace(self::PATTERN_DYNAMIC_CLOSE_TAG, '</div>', $html) ?? $html;
        $html = preg_replace(self::PATTERN_DYNAMIC_OPEN_TAG, '<div', $html) ?? $html;

        $html = preg_replace_callback(
            self::PATTERN_ATTR_VAR,
            fn($m) => preg_replace('/\$(\w+)/', '__flux_attr_$1__', $m[0]),
            $html,
        );

        return preg_replace(self::PATTERN_SS_VAR, '<flux-field data-name="$1"></flux-field>', $html) ?? $html;
    }

    /**
     * Walk the dom to find flux-field placeholders and build selectors for them,
     * It will only include fields that exist on the DataObject definition
     */
    private function parseAndWalk(string $html, array $dbFieldNames): array
    {
        $results = [];
        $doc = $this->loadDom($html);
        $xpath = new DOMXPath($doc);

        foreach ($xpath->query('//flux-field') as $placeholder) {
            $fieldName = $placeholder->getAttribute('data-name');

            if (!in_array($fieldName, $dbFieldNames)) {
                continue;
            }

            $parent = $placeholder->parentNode;
            if (!$parent || !($parent instanceof DOMElement)) {
                continue;
            }

            if (!$this->isEffectivelySoleContent($parent)) {
                continue;
            }

            $selector = $this->buildSelector($parent);
            if ($selector) {
                $results[$fieldName] = ['selector' => $selector];
            }
        }

        return $results;
    }

    /**
     * Checks if placeholder has any siblings to avoid giving selectors for fields
     * like <div class="page__content>$Image $Content</div> the same class
     * As it shouldnt
     */
    private function isEffectivelySoleContent(DOMElement $parent): bool
    {
        $meaningful = 0;

        foreach ($parent->childNodes as $child) {
            if ($child instanceof DOMText && trim($child->textContent) === '') {
                continue;
            }
            $meaningful++;
        }

        return $meaningful === 1;
    }

    /**
     * Builds a CSS selector for the given element,
     * preferring classes but falling back to tag name if no suitable classes are found
     */
    private function buildSelector(DOMElement $element): ?string
    {
        if ($element->hasAttribute('class')) {
            $classes = array_filter(
                preg_split('/\s+/', trim($element->getAttribute('class'))),
                fn ($c) => !str_contains($c, '__flux_attr_'),
            );

            if (!empty($classes)) {
                return '.' . implode('.', $classes);
            }
        }

        return $element->tagName;
    }

    /**
     * Loop through loops and get the flux relation fields
     * At the moment its only 1 level deep
     */
    private function extractLoopBlocks(string $template, array $relations): array
    {
        $results = [];

        if (!preg_match_all(self::PATTERN_SS_LOOP, $template, $matches, PREG_SET_ORDER)) {
            return $results;
        }

        $relationNames = array_keys($relations);

        foreach ($matches as $match) {
            $loopName = $match[1];
            $loopContent = $match[2];

            if (!in_array($loopName, $relationNames)) {
                continue;
            }

            $relatedClass = $this->resolveRelationClass($relations[$loopName]);
            if (!$relatedClass) {
                continue;
            }

            $relatedDb = Config::inst()->get($relatedClass, 'db') ?? [];
            $html = $this->preProcess($loopContent);
            $fieldResults = $this->parseAndWalk($html, array_keys($relatedDb));
            $itemSelector = $this->findLoopItemSelector($html);

            if (!$itemSelector) {
                continue;
            }

            $fields = [];
            foreach ($fieldResults as $fieldName => $result) {
                if (!empty($result['selector'])) {
                    $fields[$fieldName] = $result['selector'];
                }
            }

            $results[$loopName] = ['itemSelector' => $itemSelector, 'fields' => $fields];
        }

        return $results;
    }

    /**
     * Find a selector for the loop item by looking for the first non-placeholder element in the loop block
     */
    private function findLoopItemSelector(string $html): ?string
    {
        $body = $this->loadDom($html)->getElementsByTagName('body')->item(0);

        if (!$body) {
            return null;
        }

        foreach ($body->childNodes as $child) {
            if ($child instanceof DOMText && trim($child->textContent) === '') {
                continue;
            }
            if ($child instanceof DOMElement) {
                return $this->buildSelector($child);
            }
        }

        return null;
    }

    private function buildRelationFields(array $loopResults): array
    {
        $relationFields = [];

        foreach ($loopResults as $relationName => $data) {
            $entry = ['DOMSelector' => $data['itemSelector']];
            if (!empty($data['fields'])) {
                $entry['Fields'] = $data['fields'];
            }
            $relationFields[$relationName] = $entry;
        }

        return $relationFields;
    }

    private function resolveRelationClass(mixed $relation): ?string
    {
        if (is_array($relation)) {
            $relation = $relation['through'] ?? null;
        }

        if (!is_string($relation)) {
            return null;
        }

        if (str_contains($relation, '.')) {
            $relation = explode('.', $relation)[0];
        }

        return class_exists($relation) ? $relation : null;
    }

    private function buildFieldTypes(string $className, array $db, array $hasOne, array $detectedFields): array
    {
        $fieldTypes = [];
        $cmsFields = null;

        foreach ($hasOne as $name => $class) {
            if (!array_key_exists($name, $detectedFields) || !is_string($class) || !class_exists($class)) {
                continue;
            }

            $cmsFields ??= singleton($className)->getCMSFields();

            $field = $cmsFields->dataFieldByName($name) ?? $cmsFields->dataFieldByName($name . 'ID');
            if (!$field) {
                continue;
            }

            $schemaType = $this->getSchemaTypeForFormField($field);
            if ($schemaType) {
                $fieldTypes[$name] = $schemaType;
            }
        }

        foreach ($db as $name => $type) {
            if (!array_key_exists($name, $detectedFields) || !str_contains($type, 'Enum')) {
                continue;
            }

            $schemaType = $this->getSchemaTypeForFormField(Injector::inst()->create(DropdownField::class, '_'));
            if ($schemaType) {
                $fieldTypes[$name] = $schemaType;
            }
        }

        return $fieldTypes;
    }

    private function getSchemaTypeForFormField(FormField $field): ?string
    {
        $schemaDataType = $field->getSchemaDataType();

        return $schemaDataType === FormField::SCHEMA_DATA_TYPE_CUSTOM
            ? $field->getSchemaComponent()
            : $schemaDataType;
    }

    private function loadDom(string $html): DOMDocument
    {
        $doc = new DOMDocument();
        libxml_use_internal_errors(true);
        $doc->loadHTML('<body>' . $html . '</body>', LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD);
        libxml_clear_errors();
        return $doc;
    }
}
