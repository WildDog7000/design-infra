import assert from 'node:assert/strict';
import { test } from 'node:test';
import { allowedFields, levelIds, loadContract, loadSource, projectComponent, projectToken } from '../lib/contract.mjs';
import { validate } from '../scripts/validate.mjs';

const clone = (value) => JSON.parse(JSON.stringify(value));

test('the contract source is valid', () => {
  const { problems, counts } = validate();
  assert.deepEqual(problems, []);
  assert.ok(counts.tokens > 0 && counts.components > 0);
});

test('levels are ordered and cumulative', () => {
  assert.deepEqual(levelIds(), ['structure', 'description', 'rules', 'examples']);
  const structure = allowedFields('token', 'structure');
  const rules = allowedFields('token', 'rules');
  assert.equal(structure.has('description'), false);
  assert.equal(rules.has('description'), true);
  for (const field of structure) assert.equal(rules.has(field), true);
  assert.throws(() => allowedFields('token', 'vibes'), /Unknown intent level/);
});

test('projection keeps only the fields of the requested level, at every depth', () => {
  const token = {
    name: 'fgColor-muted',
    description: 'Secondary text',
    rules: 'Not for placeholder text',
    modes: { light: { value: '#111', description: 'x' }, dark: { value: '#eee' } },
  };
  assert.deepEqual(projectToken(token, 'structure'), { name: 'fgColor-muted', modes: { light: { value: '#111' }, dark: { value: '#eee' } } });
  assert.equal(projectToken(token, 'description').description, 'Secondary text');
  assert.equal('rules' in projectToken(token, 'description'), false);

  const component = {
    id: 'button',
    name: 'Button',
    guidelines: 'One primary action per view',
    examples: ['<Button />'],
    props: [{ name: 'variant', type: 'string', required: false, description: 'Visual style' }],
    subcomponents: [{ name: 'Button.Icon', props: [{ name: 'icon', type: 'string', required: true, description: 'Icon' }] }],
  };
  const structure = projectComponent(component, 'structure');
  assert.deepEqual(structure.props, [{ name: 'variant', type: 'string', required: false }]);
  assert.deepEqual(structure.subcomponents[0].props, [{ name: 'icon', type: 'string', required: true }]);
  assert.equal('guidelines' in structure, false);
  assert.equal('examples' in projectComponent(component, 'rules'), false);
  assert.deepEqual(projectComponent(component, 'examples').examples, ['<Button />']);
});

test('the structure view of the real contract carries no higher-level field', () => {
  const { level, modes, tokens, components } = loadContract();
  assert.equal(level, 'structure');
  assert.deepEqual(modes, ['light', 'dark']);
  const higher = ['description', 'usage', 'rules', 'guidelines', 'accessibility', 'examples'];
  const text = JSON.stringify({ tokens, components });
  for (const field of higher) assert.equal(text.includes(`"${field}":`), false, `found "${field}" in the structure view`);
});

test('consumers can look tokens and components up by the names they type', () => {
  const { tokens, components } = loadContract();
  const muted = tokens.find((t) => t.cssVar === '--lima-fgColor-muted');
  assert.equal(muted.type, 'color');
  assert.deepEqual(Object.keys(muted.modes), ['light', 'dark']);
  const button = components.find((c) => c.id === 'button');
  assert.equal(button.importPath, '@lima-design/react');
  assert.ok(button.props.some((p) => p.name === 'variant'));
});

test('validation catches the mistakes it exists for', () => {
  const broken = (mutate) => {
    const source = clone(loadSource());
    mutate(source);
    return validate(source).problems.join('\n');
  };
  const theme = (source) => source.tokenFiles.find((file) => file.category === 'theme').tokens;

  assert.match(broken((s) => (theme(s)[0].mood = 'calm')), /field "mood" has no intent level/);
  assert.match(broken((s) => (theme(s)[0].cssVar = '--fgColor-default')), /CSS names are/);
  assert.match(broken((s) => delete theme(s)[0].modes.dark), /a value for every mode/);
  assert.match(
    broken((s) => {
      const aliased = theme(s).find((t) => t.modes.light.alias);
      aliased.modes.light.value = '#000001';
    }),
    /an alias has the same value as its target/
  );
  assert.match(
    broken((s) => {
      const aliased = theme(s).find((t) => t.modes.light.alias);
      aliased.modes.light.alias = 'no-such-token';
    }),
    /points at an existing token/
  );
  assert.match(broken((s) => s.tokenFiles[1].tokens.push(clone(s.tokenFiles[1].tokens[0]))), /names are unique/);

  const component = (source, id) => source.componentFiles.find(({ component: c }) => c.id === id).component;
  assert.match(broken((s) => component(s, 'button').props.push(clone(component(s, 'button').props[0]))), /duplicate prop/);
  assert.match(broken((s) => (component(s, 'button').importPath = 'some-other-library')), /importPath/);
  assert.match(broken((s) => (component(s, 'dialog_deprecated').importPath = '@lima-design/react')), /deprecated component is imported from/);
  assert.match(broken((s) => (component(s, 'button').props[0].tooltip = 'hi')), /field "tooltip" has no intent level/);
});
