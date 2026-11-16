import assert from 'node:assert/strict';
import { test } from 'node:test';
import { allowedFields, levelIds, loadContract, loadIntentLevels, projectComponent, projectToken } from '../lib/contract.mjs';
import { governedFields, validate } from '../scripts/validate.mjs';

const clone = (value) => JSON.parse(JSON.stringify(value));

test('the intent-level registry covers the data exactly', () => {
  assert.deepEqual(validate().problems, []);
});

test('levels are ordered and cumulative', () => {
  assert.deepEqual(levelIds(), ['structure', 'description', 'rules', 'examples']);
  const structure = allowedFields('token', 'structure');
  const rules = allowedFields('token', 'rules');
  assert.equal(structure.has('description'), false);
  assert.equal(rules.has('description'), true);
  for (const field of structure) assert.equal(rules.has(field), true);
  assert.throws(() => allowedFields('token', 'vibes'), /Unknown intent level/);
  assert.throws(() => allowedFields('gadget', 'structure'), /Unknown record kind/);
});

test('projection keeps only the fields of the requested level, at every depth', () => {
  const token = { name: 'fgColor-muted', value: '#111', description: 'Secondary text', usage: ['text'], rules: 'Not for placeholders' };
  assert.deepEqual(projectToken(token, 'structure'), { name: 'fgColor-muted', value: '#111' });
  assert.deepEqual(Object.keys(projectToken(token, 'description')), ['name', 'value', 'description']);
  assert.deepEqual(projectToken(token, 'rules'), token);

  const component = {
    id: 'button',
    name: 'Button',
    description: 'Triggers an action',
    props: [{ name: 'variant', type: 'string', required: false, description: 'Visual style' }],
    subcomponents: [{ name: 'Button.Icon', description: 'Leading icon', props: [{ name: 'icon', type: 'string', required: true, description: 'Icon' }] }],
    types: [{ name: 'ButtonSize', description: 'Sizes', props: [] }],
  };
  const structure = projectComponent(component, 'structure');
  assert.equal('description' in structure, false);
  assert.deepEqual(structure.props, [{ name: 'variant', type: 'string', required: false }]);
  assert.deepEqual(structure.subcomponents, [{ name: 'Button.Icon', props: [{ name: 'icon', type: 'string', required: true }] }]);
  assert.deepEqual(structure.types, [{ name: 'ButtonSize', props: [] }]);
  const described = projectComponent(component, 'description');
  assert.equal(described.description, 'Triggers an action');
  assert.equal(described.subcomponents[0].props[0].description, 'Icon');
});

test('the contract combines both data packages and reports their versions', () => {
  const contract = loadContract();
  assert.equal(contract.level, 'structure');
  assert.match(contract.versions.tokens, /^\d+\.\d+\.\d+$/);
  assert.match(contract.versions.componentSchemas, /^\d+\.\d+\.\d+$/);
  assert.match(contract.versions.componentSchemaFormat, /^urn:lima-design:schema:component:/);
  assert.deepEqual(Object.keys(contract.modifiers), ['theme', 'pointer']);

  const muted = contract.tokens.find((t) => t.cssVar === '--lima-fgColor-muted');
  assert.equal(muted.type, 'color');
  assert.deepEqual(Object.keys(muted.contexts), ['light', 'dark']);
  const button = contract.components.find((c) => c.id === 'button');
  assert.equal(button.importPath, '@lima-design/react');
});

test('the structure view of the real contract carries no higher-level field', () => {
  const { tokens, components } = loadContract({ level: 'structure' });
  const text = JSON.stringify({ tokens, components });
  for (const field of ['description', 'usage', 'rules', 'guidelines', 'examples']) {
    assert.equal(text.includes(`"${field}":`), false, `found "${field}" in the structure view`);
  }
});

test('registry validation catches drift between the registry and the data', () => {
  const registry = clone(loadIntentLevels());
  const governed = governedFields();

  const missing = clone(registry);
  delete missing.fields.prop.deprecated;
  assert.match(validate(missing, governed).problems.join('\n'), /every field the data can have is assigned a level: prop\.deprecated/);

  const stale = clone(registry);
  stale.fields.component.mood = 'rules';
  assert.match(validate(stale, governed).problems.join('\n'), /does not exist: component\.mood/);

  const unknownLevel = clone(registry);
  unknownLevel.fields.token.description = 'vibes';
  assert.match(validate(unknownLevel, governed).problems.join('\n'), /token\.description -> "vibes"/);

  // a field added to a data format without a level is caught, too
  assert.match(validate(registry, { ...governed, prop: [...governed.prop, 'since'] }).problems.join('\n'), /prop\.since/);
});
