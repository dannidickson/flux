<?php

namespace Flux\Tests\TemplateEngine;

use Flux\TemplateEngine\FluxTemplateParser;
use SilverStripe\Dev\SapphireTest;

class FluxTemplateParserTest extends SapphireTest
{
    protected function setUp(): void
    {
        parent::setUp();
        // Reset block counter for each test
        FluxTemplateParser::resetBlockCounter();
    }

    /**
     * Test extracting fields from PHP code patterns
     */
    public function testExtractFieldsFromPhp()
    {
        $parser = new FluxTemplateParser();

        $reflection = new \ReflectionClass($parser);
        $method = $reflection->getMethod('extractFieldsFromPhp');
        $method->setAccessible(true);

        $phpCode1 = '$scope->getField("Title")';
        $result1 = $method->invoke($parser, $phpCode1);
        $this->assertContains('Title', $result1);

        $phpCode2 = '$scope->MyField';
        $result2 = $method->invoke($parser, $phpCode2);
        $this->assertContains('MyField', $result2);
    }

    /**
     * Test extracting fields from multiple patterns in one string
     */
    public function testExtractMultipleFieldsFromPhp()
    {
        $parser = new FluxTemplateParser();
        $reflection = new \ReflectionClass($parser);
        $method = $reflection->getMethod('extractFieldsFromPhp');
        $method->setAccessible(true);

        $phpCode = '$scope->getField("Title") && $scope->Content';
        $result = $method->invoke($parser, $phpCode);

        $this->assertContains('Title', $result);
        $this->assertContains('Content', $result);
        $this->assertCount(2, $result);
    }

    /**
     * Test extracting fields returns empty array for no matches
     */
    public function testExtractFieldsReturnsEmptyForNoMatches()
    {
        $parser = new FluxTemplateParser();
        $reflection = new \ReflectionClass($parser);
        $method = $reflection->getMethod('extractFieldsFromPhp');
        $method->setAccessible(true);

        $phpCode = '$somevar = true;';
        $result = $method->invoke($parser, $phpCode);

        $this->assertEmpty($result);
    }


    /**
     * Test block counter resets correctly
     */
    public function testBlockCounterResets()
    {
        $parser1 = new FluxTemplateParser();

        FluxTemplateParser::resetBlockCounter();

        $this->assertTrue(true);
    }

    /**
     * Test dependency map getter
     */
    public function testGetDependencyMap()
    {
        $parser = new FluxTemplateParser();
        $depMap = $parser->getDependencyMap();

        $this->assertIsArray($depMap);
    }

    /**
     * Test wrapWithMarker generates valid HTML comments
     */
    public function testWrapWithMarker()
    {
        $parser = new FluxTemplateParser();
        $reflection = new \ReflectionClass($parser);
        $method = $reflection->getMethod('wrapWithMarker');
        $method->setAccessible(true);

        $php = 'echo "test";';
        $result = $method->invoke($parser, $php, 'test-block-1', 'loop', ['Title', 'Content']);

        $this->assertStringContainsString('<!-- FLUX_START::loop:', $result);
        $this->assertStringContainsString('<!-- FLUX_END::loop:', $result);
        $this->assertStringContainsString($php, $result);

        $this->assertMatchesRegularExpression('/<!-- FLUX_START::loop:[A-Za-z0-9_]* -->/', $result);
    }

    /**
     * Test wrapWithMarker uses plain text field name
     */
    public function testWrapWithMarkerEscapesAttributes()
    {
        $parser = new FluxTemplateParser();
        $reflection = new \ReflectionClass($parser);
        $method = $reflection->getMethod('wrapWithMarker');
        $method->setAccessible(true);

        $php = 'echo "test";';
        $result = $method->invoke($parser, $php, 'block-1', 'if', ['FieldName']);

        $this->assertStringContainsString('<!-- FLUX_START::if:', $result);
        $this->assertStringContainsString('<!-- FLUX_END::if:', $result);

        preg_match('/<!-- FLUX_START::if:([A-Za-z0-9_]*) -->/', $result, $matches);
        $this->assertNotEmpty($matches);

        $this->assertEquals('FieldName', $matches[1]);
    }

    /**
     * Test extractDependenciesFromArguments
     */
    public function testExtractDependenciesFromArguments()
    {
        $parser = new FluxTemplateParser();
        $reflection = new \ReflectionClass($parser);
        $method = $reflection->getMethod('extractDependenciesFromArguments');
        $method->setAccessible(true);

        $arguments = [
            ['php' => '$scope->getField("Title")'],
            ['lookup_php' => '$scope->Content'],
        ];

        $result = $method->invoke($parser, $arguments);

        $this->assertContains('Title', $result);
        $this->assertContains('Content', $result);
    }

    /**
     * Test extractDependenciesFromIfArgument
     */
    public function testExtractDependenciesFromIfArgument()
    {
        $parser = new FluxTemplateParser();
        $reflection = new \ReflectionClass($parser);
        $method = $reflection->getMethod('extractDependenciesFromIfArgument');
        $method->setAccessible(true);

        $ifArgument = ['php' => '$scope->ShowTitle && $scope->Content'];

        $result = $method->invoke($parser, $ifArgument);

        $this->assertContains('ShowTitle', $result);
        $this->assertContains('Content', $result);
    }
}
