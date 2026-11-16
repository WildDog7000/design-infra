import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { TOKENS_ROOT, cssVar, modifiers, resolveTokens, toCss, tokenCatalog } from '../lib/index.mjs';
import { checkValue, validate } from '../scripts/validate.mjs';

test('the token source is valid', () => {
  const { problems, counts } = validate();
  assert.deepEqual(problems, []);
  assert.ok(counts.tokens > 0);
});

test('modifiers come from the resolver document', () => {
  assert.deepEqual(modifiers(), {
    theme: { contexts: ['light', 'dark'], default: 'light' },
    pointer: { contexts: ['fine', 'coarse'], default: 'fine' },
  });
});

test('resolving picks one context per modifier and falls back to defaults', () => {
  const light = resolveTokens();
  const dark = resolveTokens({ theme: 'dark' });
  assert.equal(light.get('fgColor.muted').origin.context, 'light');
  assert.notDeepEqual(light.get('fgColor.muted').value, dark.get('fgColor.muted').value);
  // a token outside the theme modifier is untouched by it
  assert.deepEqual(light.get('base.size.8').value, dark.get('base.size.8').value);

  const fine = resolveTokens({ pointer: 'fine' }).get('control.minTarget.auto').value;
  const coarse = resolveTokens({ pointer: 'coarse' }).get('control.minTarget.auto').value;
  assert.ok(coarse.value > fine.value, 'touch targets grow for coarse pointers');

  assert.throws(() => resolveTokens({ theme: 'sepia' }), /Unknown context "sepia"/);
  assert.throws(() => resolveTokens({ density: 'compact' }), /Unknown modifier "density"/);
});

test('aliases are replaced all the way down, including inside composite values', () => {
  const tokens = resolveTokens();
  const typography = tokens.get('text.body.shorthand.medium');
  assert.equal(typeof typography.token.$value.fontSize, 'string', 'the source holds an alias');
  assert.deepEqual(Object.keys(typography.value.fontSize), ['value', 'unit'], 'the resolved value holds the dimension');
  assert.ok(Array.isArray(typography.value.fontFamily));
  assert.equal(JSON.stringify([...tokens.values()].map((t) => t.value)).includes('{'), true, 'objects remain');
  for (const { value } of tokens.values()) assert.equal(/"\{[^"]+\}"/.test(JSON.stringify(value)), false, 'no alias string remains');
});

test('CSS form of each value type', () => {
  assert.equal(toCss('color', { colorSpace: 'srgb', components: [1, 1, 1], hex: '#ffffff' }), '#ffffff');
  assert.equal(toCss('color', { colorSpace: 'srgb', components: [0, 0, 0], alpha: 0.5, hex: '#000000' }), '#00000080');
  assert.equal(toCss('color', { colorSpace: 'srgb', components: [1, 0, 0] }), '#ff0000');
  assert.equal(toCss('dimension', { value: 0.5, unit: 'rem' }), '0.5rem');
  assert.equal(toCss('dimension', { value: 0, unit: 'px' }), '0px');
  assert.equal(toCss('fontFamily', ['Segoe UI', 'sans-serif']), '"Segoe UI", sans-serif');
  assert.equal(toCss('duration', { value: 200, unit: 'ms' }), '200ms');
  assert.equal(toCss('cubicBezier', [0.3, 0.8, 0.6, 1]), 'cubic-bezier(0.3, 0.8, 0.6, 1)');
  const black = { colorSpace: 'srgb', components: [0, 0, 0], hex: '#000000' };
  const px = (value) => ({ value, unit: 'px' });
  assert.equal(toCss('border', { color: black, width: px(1), style: 'solid' }), '1px solid #000000');
  assert.equal(
    toCss('shadow', [
      { color: black, offsetX: px(0), offsetY: px(1), blur: px(2), spread: px(0) },
      { color: black, offsetX: px(0), offsetY: px(0), blur: px(0), spread: px(1), inset: true },
    ]),
    '0px 1px 2px 0px #000000, inset 0px 0px 0px 1px #000000'
  );
  assert.equal(
    toCss('transition', { duration: { value: 80, unit: 'ms' }, delay: { value: 0, unit: 'ms' }, timingFunction: [0, 0, 1, 1] }),
    '80ms cubic-bezier(0, 0, 1, 1)'
  );
  assert.throws(() => toCss('mystery', 1), /No CSS form/);
  assert.throws(() => toCss('color', { colorSpace: 'oklch', components: [0.5, 0.1, 20] }), /Only srgb/);
});

test('the catalog gives one record per token, with every context it varies by', () => {
  const catalog = tokenCatalog();
  const byName = new Map(catalog.map((t) => [t.name, t]));
  assert.equal(byName.size, catalog.length, 'names are unique');

  const muted = byName.get('fgColor-muted');
  assert.equal(muted.cssVar, '--lima-fgColor-muted');
  assert.equal(muted.cssVar, cssVar(muted.path));
  assert.equal(muted.modifier, 'theme');
  assert.deepEqual(Object.keys(muted.contexts), ['light', 'dark']);
  assert.match(muted.contexts.light.value, /^#[0-9a-f]{6}$/);
  assert.equal('value' in muted, false);

  const size = byName.get('base-size-8');
  assert.equal(size.tier, 'base');
  assert.equal(size.value, '0.5rem');
  assert.equal('modifier' in size, false);

  const target = byName.get('control-minTarget-auto');
  assert.equal(target.modifier, 'pointer');
  assert.deepEqual(Object.keys(target.contexts), ['fine', 'coarse']);
});

test('the catalog records what a token points at, and an alias always has its target’s value', () => {
  const catalog = tokenCatalog();
  const byName = new Map(catalog.map((t) => [t.name, t]));
  const valueOf = (name, context) => {
    const target = byName.get(name);
    return target.contexts ? target.contexts[context] : target;
  };
  let aliases = 0;
  let composites = 0;
  for (const token of catalog) {
    const views = token.contexts ? Object.entries(token.contexts) : [[undefined, token]];
    for (const [context, view] of views) {
      if (view.alias) {
        aliases++;
        assert.equal(view.value, valueOf(view.alias, context).value, `${token.name} = ${view.alias}`);
      }
      for (const ref of view.refs ?? []) {
        composites++;
        assert.ok(byName.has(ref), `${token.name} refers to ${ref}`);
      }
    }
  }
  assert.ok(aliases > 0 && composites > 0);
});

test('validation catches the mistakes it exists for', () => {
  const broken = (edit) => {
    const root = mkdtempSync(join(tmpdir(), 'lima-tokens-'));
    cpSync(join(TOKENS_ROOT, 'src'), join(root, 'src'), { recursive: true });
    cpSync(join(TOKENS_ROOT, 'lima.resolver.json'), join(root, 'lima.resolver.json'));
    const file = (path, change) => {
      const full = join(root, path);
      const json = JSON.parse(readFileSync(full, 'utf8'));
      change(json);
      writeFileSync(full, JSON.stringify(json));
    };
    edit(file);
    return validate(root).problems.join('\n');
  };
  const light = 'src/theme/light.tokens.json';

  assert.match(broken((f) => f(light, (t) => (t.fgColor.muted.$value.hex = '#000000'))), /disagrees with components/);
  assert.match(broken((f) => f(light, (t) => (t.fgColor.muted.$value = '#59636e'))), /must be a color object/);
  assert.match(broken((f) => f(light, (t) => (t.fgColor.muted.$value = '{fgColor.nope}'))), /no such token/);
  assert.match(broken((f) => f(light, (t) => (t.fgColor.muted.$value = '{base.size.8}'))), /is dimension, position needs color/);
  assert.match(broken((f) => f(light, (t) => delete t.fgColor.muted)), /not defined exactly once in theme context\(s\) light/);
  assert.match(broken((f) => f(light, (t) => (t.fgColor.muted.note = 'hi'))), /unknown property "note"/);
  assert.match(broken((f) => f(light, (t) => (t.base = { size: { 8: t.fgColor.muted } }))), /defined by set:base and modifier:theme/);
  assert.match(
    broken((f) => f('src/base/size.tokens.json', (t) => (t.base.size['8'].$value = { value: 0.5, unit: 'em' }))),
    /must be \{ value, unit: "px" \| "rem" \}/
  );
  assert.match(
    broken((f) => f('src/functional/size.tokens.json', (t) => (t.borderWidth.default = { $type: 'color', $value: '{fgColor.muted}' }))),
    /\(set functional\) -> \{fgColor\.muted\} \(modifier theme\)/
  );
  assert.match(broken((f) => f('lima.resolver.json', (r) => (r.modifiers.theme.default = 'sepia'))), /default "sepia" is not one of its contexts/);
});

test('value checks report which type an alias position requires', () => {
  assert.deepEqual(checkValue('border', { color: '{a}', width: '{b}', style: 'solid' }).expects, [
    { target: 'a', type: 'color' },
    { target: 'b', type: 'dimension' },
  ]);
  assert.match(checkValue('typography', { fontFamily: ['x'] }).problems.join(), /missing member "fontSize"/);
  assert.match(checkValue('shadow', [{ color: 1 }]).problems.join(), /"color" must be a color object/);
});
