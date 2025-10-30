<?php

namespace Flux\Tests\Core;

use Flux\Core\FluxTemplateProvider;
use SilverStripe\Dev\SapphireTest;

class TemplateProviderTest extends SapphireTest
{
    /**
     * Test that SetFluxAttributes correctly formats attributes with fx- prefix
     */
    public function testSetFluxAttributesFormatsCorrectly()
    {
        $result = FluxTemplateProvider::SetFluxAttributes(
            'action:submit',
            'event:click'
        );

        $expected = 'fx-action="submit" fx-event="click"';
        $this->assertEquals($expected, $result);
    }

    /**
     * Test that SetFluxAttributes handles edge cases correctly
     */
    public function testSetFluxAttributesHandlesEdgeCases()
    {
        // Test with attributes that already have fx- prefix
        $result = FluxTemplateProvider::SetFluxAttributes(
            'fx-custom:value',
            'action:submit'
        );
        $expected = 'fx-custom="value" fx-action="submit"';
        $this->assertEquals($expected, $result);

        // Test with invalid attributes (no colon) - should be skipped
        $result = FluxTemplateProvider::SetFluxAttributes(
            'invalid',
            'action:submit'
        );
        $expected = 'fx-action="submit"';
        $this->assertEquals($expected, $result);

        // Test with empty input
        $result = FluxTemplateProvider::SetFluxAttributes();
        $this->assertEquals('', $result);
    }
}
