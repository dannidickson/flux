<?php

namespace Flux\Tests\Extension;

use SilverStripe\Dev\SapphireTest;
use SilverStripe\Forms\CheckboxField;
use SilverStripe\Forms\CheckboxSetField;
use SilverStripe\Forms\DropdownField;
use SilverStripe\Forms\HiddenField;
use SilverStripe\Forms\HTMLEditor\HTMLEditorField;
use SilverStripe\Forms\OptionsetField;
use SilverStripe\Forms\TextField;

class FormFieldTest extends SapphireTest
{
    /**
     * Base FormField gets fx-key, fx-bind, fx-type from FormFieldExtension
     */
    public function testFormFieldFluxAttributes(): void
    {
        $field = new HiddenField('Title');
        $field->applyFluxAttributes('Title', 'Page.Title', 'text');

        $this->assertEquals('Title', $field->getAttribute('fx-key'));
        $this->assertEquals('Page.Title', $field->getAttribute('fx-bind'));
        $this->assertEquals('text', $field->getAttribute('fx-type'));
    }

    /**
     * CheckboxField gets fx-key, fx-bind, fx-type plus fx-event=click
     */
    public function testCheckboxFieldFluxAttributes(): void
    {
        $field = new CheckboxField('IsActive');
        $field->applyFluxAttributes('IsActive', 'Page.IsActive', 'boolean');

        $this->assertEquals('IsActive', $field->getAttribute('fx-key'));
        $this->assertEquals('Page.IsActive', $field->getAttribute('fx-bind'));
        $this->assertEquals('boolean', $field->getAttribute('fx-type'));
        $this->assertEquals('click', $field->getAttribute('fx-event'));
    }

    /**
     * CheckboxSetField gets fx-key, fx-bind, fx-type plus fx-event=change and fx-collect
     */
    public function testCheckboxSetFieldFluxAttributes(): void
    {
        $field = new CheckboxSetField('Tags', 'Tags', []);
        $field->applyFluxAttributes('Tags', 'Page.Tags', 'set');

        $this->assertEquals('Tags', $field->getAttribute('fx-key'));
        $this->assertEquals('Page.Tags', $field->getAttribute('fx-bind'));
        $this->assertEquals('set', $field->getAttribute('fx-type'));
        $this->assertEquals('change', $field->getAttribute('fx-event'));
        $this->assertEquals("input[type='checkbox']:checked", $field->getAttribute('fx-collect'));
    }

    /**
     * HTMLEditorField gets fx-key, fx-bind, fx-type plus fx-event=keyup
     */
    public function testHTMLEditorFieldFluxAttributes(): void
    {
        $field = new HTMLEditorField('Content');
        $field->applyFluxAttributes('Content', 'Page.Content', 'html');

        $this->assertEquals('Content', $field->getAttribute('fx-key'));
        $this->assertEquals('Page.Content', $field->getAttribute('fx-bind'));
        $this->assertEquals('html', $field->getAttribute('fx-type'));
        $this->assertEquals('keyup', $field->getAttribute('fx-event'));
    }

    /**
     * OptionsetField gets fx-key, fx-bind, fx-type plus fx-event=change
     */
    public function testOptionSetFieldFluxAttributes(): void
    {
        $field = new OptionsetField('Status', 'Status', []);
        $field->applyFluxAttributes('Status', 'Page.Status', 'enum');

        $this->assertEquals('Status', $field->getAttribute('fx-key'));
        $this->assertEquals('Page.Status', $field->getAttribute('fx-bind'));
        $this->assertEquals('enum', $field->getAttribute('fx-type'));
        $this->assertEquals('change', $field->getAttribute('fx-event'));
    }

    /**
     * SingleSelectField (DropdownField) gets fx-key, fx-bind, fx-type plus
     * fx-event=change, fx-proxy, and fx-proxy-type=default
     */
    public function testSingleSelectFieldFluxAttributes(): void
    {
        $field = new DropdownField('CategoryID', 'Category', []);
        $field->applyFluxAttributes('CategoryID', 'Page.CategoryID', 'select');

        $this->assertEquals('CategoryID', $field->getAttribute('fx-key'));
        $this->assertEquals('Page.CategoryID', $field->getAttribute('fx-bind'));
        $this->assertEquals('select', $field->getAttribute('fx-type'));
        $this->assertEquals('change', $field->getAttribute('fx-event'));
        $this->assertEquals("input[type='hidden']", $field->getAttribute('fx-proxy'));
        $this->assertEquals('default', $field->getAttribute('fx-proxy-type'));
    }

    /**
     * TextField gets fx-key, fx-bind, fx-type plus fx-event=keyup
     */
    public function testTextFieldFluxAttributes(): void
    {
        $field = new TextField('Title');
        $field->applyFluxAttributes('Title', 'Page.Title', 'text');

        $this->assertEquals('Title', $field->getAttribute('fx-key'));
        $this->assertEquals('Page.Title', $field->getAttribute('fx-bind'));
        $this->assertEquals('text', $field->getAttribute('fx-type'));
        $this->assertEquals('keyup', $field->getAttribute('fx-event'));
    }

    /**
     * UploadField requires silverstripe/asset-admin — skip if not installed
     */
    public function testUploadFieldFluxAttributes(): void
    {
        if (!class_exists('SilverStripe\AssetAdmin\Forms\UploadField')) {
            $this->markTestSkipped('silverstripe/asset-admin is not installed');
        }

        $field = new \SilverStripe\AssetAdmin\Forms\UploadField('Image');
        $field->applyFluxAttributes('Image', 'Page.Image', 'file');

        $this->assertEquals('Image', $field->getAttribute('fx-key'));
        $this->assertEquals('Page.Image', $field->getAttribute('fx-bind'));
        $this->assertEquals('file', $field->getAttribute('fx-type'));
        $this->assertEquals('change', $field->getAttribute('fx-event'));
        $this->assertEquals("input[type='hidden']", $field->getAttribute('fx-proxy'));
        $this->assertEquals('previousElementSibling', $field->getAttribute('fx-proxy-type'));
    }
}
