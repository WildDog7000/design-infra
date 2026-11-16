/**
 * Conformance: an independent DTCG parser (Terrazzo) must be able to read the
 * resolver document and every token file, and must resolve every context
 * combination to the same CSS values as the library in this package.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { defineConfig, parse } from '@terrazzo/parser';
import { TOKENS_ROOT, modifiers, resolveTokens, toCss } from '../lib/index.mjs';

test('an independent DTCG parser reads the source and agrees on every resolved value', async () => {
  const cwd = pathToFileURL(`${TOKENS_ROOT}/`);
  // Lima token names are camelCase by decision; the parser's default naming lint prefers kebab-case.
  const config = defineConfig({ lint: { rules: { 'core/consistent-naming': 'off' } } }, { cwd });
  const filename = new URL('lima.resolver.json', cwd);
  const { resolver } = await parse([{ filename, src: readFileSync(filename, 'utf8') }], { config });

  const combinations = Object.entries(modifiers()).reduce(
    (all, [name, { contexts }]) => all.flatMap((inputs) => contexts.map((context) => ({ ...inputs, [name]: context }))),
    [{}]
  );
  assert.equal(combinations.length, 4);

  for (const inputs of combinations) {
    const theirs = resolver.apply(inputs);
    const ours = resolveTokens(inputs);
    assert.deepEqual(Object.keys(theirs).sort(), [...ours.keys()].sort(), `same token set for ${JSON.stringify(inputs)}`);
    for (const [key, entry] of ours) {
      assert.equal(theirs[key].$type, entry.type, `${key} type`);
      // The parser normalizes values (explicit alpha, shadows always a list), so compare what each side means in CSS.
      assert.equal(toCss(entry.type, theirs[key].$value), toCss(entry.type, entry.value), `${key} for ${JSON.stringify(inputs)}`);
    }
  }
});
