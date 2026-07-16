import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cssVarName, resolveToken, searchTokens, suggestToken } from './lib.mjs';

test('cssVarName matches Style Dictionary kebab output', () => {
  assert.equal(cssVarName('color.accent.bg.default'), '--llp-color-accent-bg-default');
  assert.equal(cssVarName('color.neutral.subdued_content.default'), '--llp-color-neutral-subdued-content-default');
});

test('resolveToken walks usage → semantic → primitive to a literal', () => {
  const { chain, value, type } = resolveToken('color.accent.bg.default', 'light');
  assert.deepEqual(chain.map((t) => t.tier), ['usage', 'semantic', 'primitive']);
  assert.equal(type, 'color');
  assert.match(value, /^#[0-9a-f]{6,8}$/i);
});

test('dark theme re-anchors the scale position behind the same role', () => {
  const light = resolveToken('color.accent.bg.default', 'light');
  const dark = resolveToken('color.accent.bg.default', 'dark');
  assert.notDeepEqual(light.chain.at(-1), dark.chain.at(-1), 'expected different primitive endpoints per theme');
});

test('resolveToken rejects unknown tokens and themes', () => {
  assert.throws(() => resolveToken('color.nope.900', 'light'), /not found/);
  assert.throws(() => resolveToken('color.accent.900', 'sepia'), /unknown theme/);
});

test('searchTokens is separator-insensitive and filterable', () => {
  const hits = searchTokens({ query: 'accent bg' });
  assert.ok(hits.some((t) => t.name === 'color.accent.bg.default'));
  const usageOnly = searchTokens({ query: 'accent', tier: 'usage' });
  assert.ok(usageOnly.length > 0);
  assert.ok(usageOnly.every((t) => t.tier === 'usage'));
  const dims = searchTokens({ query: 'space', type: 'dimension' });
  assert.ok(dims.every((t) => t.type === 'dimension'));
});

test('searchTokens resolves aliases to end values', () => {
  const [hit] = searchTokens({ query: 'color.accent.900', tier: 'semantic' });
  assert.match(hit.value, /^\{color\./, 'raw value stays a reference');
  assert.match(hit.resolvedValue, /^#/, 'resolvedValue is the literal');
});

test('suggestToken puts exact matches first and prefers usage tier on ties', () => {
  const exactHex = resolveToken('color.negative.bg.default', 'light').value;
  const [first] = suggestToken(exactHex);
  assert.equal(first.exact, true);
  assert.equal(first.tier, 'usage');
});

test('suggestToken ranks near misses by distance', () => {
  const results = suggestToken('#3b63fa'); // one off from accent blue-900 #3b63fb
  assert.ok(results.length > 0);
  assert.equal(results[0].exact, false);
  assert.ok(results[0].distance <= results.at(-1).distance);
  assert.ok(results[0].resolvedValue.toLowerCase() === '#3b63fb');
});

test('suggestToken rejects non-hex input', () => {
  assert.throws(() => suggestToken('tomato'), /not a hex color/);
});
