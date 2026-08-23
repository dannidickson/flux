<?php

namespace Flux\Dev;

use Flux\Core\Configuration;
use Flux\Schema\UpdateMode;
use Flux\Template\Analysis\ClassResolver;
use Flux\Template\Analysis\ConfigSchemaInspector;
use Flux\Template\Analysis\FieldBinding;
use Flux\Template\Analysis\IncludeResolver;
use Flux\Template\Analysis\SelectorBuilder;
use Flux\Template\Analysis\SkipReport;
use Flux\Template\Analysis\TemplateAnalyzer;
use Flux\Template\Analysis\ThemeIncludeLocator;
use Flux\Template\Ast\AstDumper;
use Flux\Template\Parser\Parser;
use Flux\Template\Parser\TagHandler;
use Flux\Template\Parser\TagHandlerRegistry;
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
 * Generates flux_fields YAML from the project's templates and DataObjects, via
 * {@see TemplateAnalyzer}. Runs at /dev/flux-generate-config.
 */
class FluxGenerateConfigTask extends DevCommand
{

    protected static string $commandName = 'flux-generate-config';

    protected string $title = 'Generate Flux Field Config';

    protected static string $description =
        'Analyses templates and DataObjects to generate flux_fields YAML configuration.';

    public function getTitle(): string
    {
        return $this->title;
    }

    public function getHeading(): string
    {
        return $this->title;
    }

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
            new InputOption(
                'dump-ast',
                null,
                InputOption::VALUE_NONE,
                'Also write the parsed template AST to a YAML file for inspection',
            ),
            new InputOption(
                'ast-output',
                null,
                InputOption::VALUE_REQUIRED,
                'Path for the --dump-ast output',
                'app/_config/flux-ast.yml',
            ),
        ];
    }

    protected function execute(InputInterface $input, PolyOutput $output): int
    {
        $tags = $this->buildTagRegistry();
        $analyzer = new TemplateAnalyzer(
            new ClassResolver(new ConfigSchemaInspector()),
            new SelectorBuilder(),
            new IncludeResolver(new ThemeIncludeLocator(), $tags),
        );

        $dumper = null;

        if ($input->getOption('dump-ast')) {
            $dumper = new AstDumper();
        }

        $config = [];
        $reports = [];
        $astDump = [];

        foreach ($this->getFluxDataObjects() as $className => $templates) {
            $report = $this->analyseClass($analyzer, $tags, $className, $templates, $dumper);

            if ($report['config'] !== null) {
                $config[$className] = $report['config'];
            }

            if ($report['ast'] !== []) {
                $astDump[$className] = $report['ast'];
            }

            $reports[$className] = $report;
        }

        if ($config === []) {
            $output->writeln('No flux DataObjects with bindable fields found.');

            return Command::SUCCESS;
        }

        if (!$input->getOption('dry-run')) {
            $outputPath = BASE_PATH . '/' . $input->getOption('output');
            file_put_contents($outputPath, Yaml::dump($config, 6, 2));
            $output->writeln('Generated: ' . $outputPath);
            $output->writeln('');
        }

        if ($dumper !== null && $astDump !== []) {
            $astPath = BASE_PATH . '/' . $input->getOption('ast-output');
            file_put_contents($astPath, Yaml::dump($astDump, 99, 2));
            $output->writeln('AST written: ' . $astPath);
            $output->writeln('');
        }

        $this->printReport($output, $reports);

        return Command::SUCCESS;
    }

    /**
     * Builds the tag handler registry from the template_tag_handlers config.
     */
    private function buildTagRegistry(): TagHandlerRegistry
    {
        $registry = new TagHandlerRegistry();
        $handlers = Configuration::config()->get('template_tag_handlers') ?? [];

        foreach ($handlers as $keyword => $class) {
            if (!is_string($class) || !class_exists($class)) {
                continue;
            }

            $handler = Injector::inst()->create($class);

            if (!($handler instanceof TagHandler)) {
                continue;
            }

            $registry->register((string) $keyword, $handler);
        }

        return $registry;
    }

    private function getFluxDataObjects(): array
    {
        $classes = [];
        $excluded = Configuration::config()->get('excluded_classes') ?? [];

        foreach (ClassInfo::subclassesFor(DataObject::class, false) as $class) {
            $db = Config::inst()->get($class, 'db');

            if (in_array($class, $excluded) || $db === null || $db === []) {
                continue;
            }

            $templates = $this->findTemplatesForClass($class);

            if ($templates === []) {
                continue;
            }

            $classes[$class] = $templates;
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
            $templateList = [$candidate];
            $type = '';

            if (is_array($candidate)) {
                $templateList = $candidate['templates'] ?? $candidate;
                $type = $candidate['type'] ?? '';
            }

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

                    if (!file_exists($layoutPath)) {
                        continue;
                    }

                    $found[] = $layoutPath;
                }
            }
        }

        return array_unique($found);
    }

    /**
     * Analyses every template for a class and assembles the flux_fields config.
     *
     * @return array{
     *     config: ?array,
     *     fields: array<string, string|array>,
     *     skips: SkipReport[],
     *     fieldNames: string[],
     *     ast: array<string, mixed>
     * }
     */
    private function analyseClass(
        TemplateAnalyzer $analyzer,
        TagHandlerRegistry $tags,
        string $className,
        array $templates,
        ?AstDumper $dumper = null,
    ): array {
        $config = Config::inst();
        $db = $config->get($className, 'db') ?? [];
        $hasOne = $config->get($className, 'has_one') ?? [];

        $fluxFields = [];
        $relationFields = [];
        $skips = [];
        $ast = [];

        foreach ($templates as $templatePath) {
            $content = file_get_contents($templatePath);

            if (!$content) {
                continue;
            }

            $tree = Parser::parse($content, $tags);

            if ($dumper !== null) {
                $ast[$templatePath] = $dumper->dump($tree);
            }

            $result = $analyzer->analyze($tree, $className);

            foreach ($result->bindings as $binding) {
                if ($binding->scope !== FieldBinding::SCOPE_PAGE) {
                    continue;
                }

                $this->mergeBinding($fluxFields, $binding);
            }

            foreach ($result->relationsByName() as $name => $relation) {
                if ($relation->itemSelector === null) {
                    continue;
                }

                $entry = ['DOMSelector' => $relation->itemSelector];
                $fields = [];

                foreach ($relation->fields as $fieldBinding) {
                    $this->mergeBinding($fields, $fieldBinding);
                }

                if ($fields !== []) {
                    $entry['Fields'] = array_map($this->formatFieldEntry(...), $fields);
                }

                $relationFields[$name] = $entry;
            }

            array_push($skips, ...$result->skips);
        }

        $fluxFields = array_map($this->formatFieldEntry(...), $fluxFields);
        $fluxFieldTypes = $this->buildFieldTypes($className, $db, $hasOne, $fluxFields);

        // drop the empty sections, as they wont have any fields.
        $configOut = array_filter([
            'flux_fields' => $fluxFields,
            'flux_fieldtypes' => $fluxFieldTypes,
            'flux_relation_fields' => $relationFields,
        ]);

        if ($configOut === []) {
            $configOut = null;
        }

        return [
            'config' => $configOut,
            'fields' => $fluxFields,
            'skips' => $this->dedupeSkips($skips),
            'fieldNames' => array_merge(array_keys($db), array_keys($hasOne)),
            'ast' => $ast,
        ];
    }

    /**
     * One field can be bound several times, so selectors union and the strongest update mode
     * wins. A binding with no selector of its own only gates an `<% if %>`.
     *
     * @param array<string, array{selectors: string[], mode: string, isConditional: bool}> $fields by ref
     */
    private function mergeBinding(array &$fields, FieldBinding $binding): void
    {
        $entry = $fields[$binding->field] ?? ['selectors' => [], 'mode' => UpdateMode::TEXT, 'isConditional' => false];

        foreach (explode(', ', $binding->selector) as $selector) {
            if ($selector === '' || in_array($selector, $entry['selectors'], true)) {
                continue;
            }

            $entry['selectors'][] = $selector;
        }

        if ($binding->updateMode !== UpdateMode::TEXT) {
            $entry['mode'] = $binding->updateMode;
        }

        if ($binding->isConditional) {
            $entry['isConditional'] = true;
        }

        $fields[$binding->field] = $entry;
    }

    /**
     * Emits the short form (a bare selector string) for the common case, and only falls back
     * to the verbose map when the entry carries more than a default text update.
     *
     * @param array{selectors: string[], mode: string, isConditional: bool} $entry
     * @return string|array{DOMSelector?: string, IsConditional?: true, UpdateMode: string}
     */
    private function formatFieldEntry(array $entry): string|array
    {
        if ($entry['mode'] === UpdateMode::TEXT && !$entry['isConditional']) {
            return implode(', ', $entry['selectors']);
        }

        $map = [];

        if (!$entry['selectors']) {
            $map['DOMSelector'] = implode(', ', $entry['selectors']);
        }

        if ($entry['isConditional']) {
            $map['IsConditional'] = true;
        }

        $map['UpdateMode'] = $entry['mode'];

        return $map;
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

            if (!$schemaType) {
                continue;
            }

            $fieldTypes[$name] = $schemaType;
        }

        foreach ($db as $name => $type) {
            if (!array_key_exists($name, $detectedFields) || !str_contains($type, 'Enum')) {
                continue;
            }

            $schemaType = $this->getSchemaTypeForFormField(Injector::inst()->create(DropdownField::class, '_'));

            if (!$schemaType) {
                continue;
            }

            $fieldTypes[$name] = $schemaType;
        }

        return $fieldTypes;
    }

    private function getSchemaTypeForFormField(FormField $field): ?string
    {
        $schemaDataType = $field->getSchemaDataType();

        if ($schemaDataType === FormField::SCHEMA_DATA_TYPE_CUSTOM) {
            return $field->getSchemaComponent();
        }

        return $schemaDataType;
    }

    /**
     * Collapses repeated skips (same field + reason) to one each.
     *
     * @param SkipReport[] $skips
     * @return SkipReport[]
     */
    private function dedupeSkips(array $skips): array
    {
        $seen = [];
        $deduped = [];

        foreach ($skips as $skip) {
            $key = $skip->field . '|' . $skip->reason;

            if (isset($seen[$key])) {
                continue;
            }

            $seen[$key] = true;
            $deduped[] = $skip;
        }

        return $deduped;
    }

    /**
     * Only skips the developer can act on are printed in full; expected noise (template vars
     * that aren't fields) is tallied instead, so nothing is swallowed silently.
     *
     * @param array<string, array{
     *     config: ?array,
     *     fields: array<string, string|array>,
     *     skips: SkipReport[],
     *     fieldNames: string[]
     * }> $reports
     */
    private function printReport(PolyOutput $output, array $reports): void
    {
        foreach ($reports as $className => $report) {
            $actionable = array_filter(
                $report['skips'],
                function (SkipReport $s) use ($report) {
                    return $this->isActionableSkip($s, $report['fieldNames']);
                },
            );

            if (!$report['fields'] && !$actionable) {
                continue;
            }

            $output->writeln($className);

            foreach ($report['fields'] as $field => $entry) {
                $display = $entry;

                if (is_array($entry)) {
                    $display = sprintf('%s [%s]', $entry['DOMSelector'] ?? 'condition', $entry['UpdateMode']);
                }

                $output->writeln(sprintf('  %s → %s', str_pad($field, 22), $display));
            }

            foreach ($actionable as $skip) {
                $detail = '';

                if ($skip->detail !== '') {
                    $detail = sprintf(' (%s)', $skip->detail);
                }

                $output->writeln(sprintf('  %s ✗ skipped: %s%s', str_pad($skip->field, 22), $skip->reason, $detail));
            }

            $ignored = count($report['skips']) - count($actionable);

            if ($ignored > 0) {
                $output->writeln(
                    sprintf('  (%d other reference(s) ignored: non-fields or unresolved scopes)', $ignored)
                );
            }

            $output->writeln('');
        }
    }

    /**
     * Report any fields that likely could be mapped
     * Skip no include or Variables on their own
     *
     * @param string[] $fieldNames
     */
    private function isActionableSkip(SkipReport $skip, array $fieldNames): bool
    {
        return match ($skip->reason) {
            SkipReport::NOT_SOLE_CONTENT => true,
            SkipReport::INCLUDE_NOT_FOUND => true,
            // Only ever raised for names already confirmed as fields/relations.
            SkipReport::NO_UNIQUE_SELECTOR => true,
            SkipReport::ATTRIBUTE => in_array($skip->field, $fieldNames, true),
            default => false,
        };
    }

}
