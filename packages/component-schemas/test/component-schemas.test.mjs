import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FORMAT_ID, VERSION, loadComponentSchemaFiles, loadComponentSchemas, loadFormat } from '../lib/index.mjs';
import { validate } from '../scripts/validate.mjs';

const clone = (value) => JSON.parse(JSON.stringify(value));

test('every component schema is valid', () => {
  const { problems, counts } = validate();
  assert.deepEqual(problems, []);
  assert.ok(counts.components > 0);
});

test('the set and the format are versioned separately', () => {
  assert.match(VERSION, /^\d+\.\d+\.\d+$/);
  assert.match(FORMAT_ID, /^urn:lima-design:schema:component:\d+\.\d+\.\d+$/);
  assert.equal(loadFormat().$id, FORMAT_ID);
});

test('components are loaded without the $schema pointer', () => {
  const components = loadComponentSchemas();
  assert.equal(components.some((c) => '$schema' in c), false);
  const button = components.find((c) => c.id === 'button');
  assert.equal(button.name, 'Button');
  assert.equal(button.importPath, '@lima-design/react');
  assert.ok(button.props.some((p) => p.name === 'variant' && p.type.includes("'danger'")));
});

test('the current and the deprecated Dialog are told apart by id, status and import path', () => {
  const components = loadComponentSchemas();
  const current = components.find((c) => c.id === 'dialog');
  const old = components.find((c) => c.id === 'dialog_deprecated');
  assert.equal(current.name, old.name);
  assert.notEqual(current.status, 'deprecated');
  assert.equal(old.status, 'deprecated');
  assert.equal(old.importPath, '@lima-design/react/deprecated');
});

test('validation catches the mistakes it exists for', () => {
  const broken = (edit) => {
    const files = clone(loadComponentSchemaFiles());
    edit((id) => files.find((f) => f.schema.id === id).schema, files);
    return validate(files).problems.join('\n');
  };
  assert.match(broken((c) => (c('button').mood = 'calm')), /must NOT have additional properties "mood"/);
  assert.match(broken((c) => (c('button').props[0].tooltip = 'hi')), /must NOT have additional properties "tooltip"/);
  assert.match(broken((c) => delete c('button').props[0].type), /must have required property 'type'/);
  assert.match(broken((c) => (c('button').status = 'retired')), /must be equal to one of the allowed values/);
  assert.match(broken((c) => (c('button').importPath = 'some-other-library')), /must match pattern/);
  assert.match(broken((c) => (c('button').id = 'btn')), /id is "btn"/);
  assert.match(broken((c) => c('button').props.push(clone(c('button').props[0]))), /listed more than once/);
  assert.match(broken((c) => (c('dialog').subcomponents[0].name = 'Modal.Header')), /does not start with "Dialog\."/);
  assert.match(broken((c) => (c('dialog_deprecated').importPath = '@lima-design/react')), /lifecycle/);
  assert.match(broken((c, files) => files.push(clone(files[0]))), /is also used by/);
  assert.match(
    broken((c) => {
      const prop = c('button').props.find((p) => p.defaultValue !== undefined);
      prop.required = true;
    }),
    /required but has a default/
  );
});
