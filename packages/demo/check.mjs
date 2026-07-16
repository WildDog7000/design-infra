/**
 * Consumer-contract guard for the demo:
 *  1. demo.css must not contain raw color values (hex / rgb / hsl) —
 *     components may only consume tokens.
 *  2. every var(--llp-*) referenced in demo.css must exist in the built
 *     CSS deliverables — catches typos and contract regressions that
 *     would silently break consumers.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, 'demo.css'), 'utf8');
const built =
  readFileSync(join(here, '../tokens/dist/css/tokens.css'), 'utf8') +
  readFileSync(join(here, '../tokens/dist/css/tokens.dark.css'), 'utf8');

const errors = [];

const cssWithoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
const rawColor = cssWithoutComments.match(/#[0-9a-fA-F]{3,8}\b|\b(?:rgb|hsl)a?\(/g);
if (rawColor) errors.push(`raw color values in demo.css: ${[...new Set(rawColor)].join(', ')}`);

const declared = new Set([...built.matchAll(/(--llp-[\w-]+)\s*:/g)].map((m) => m[1]));
const referenced = new Set([...cssWithoutComments.matchAll(/var\((--llp-[\w-]+)\)/g)].map((m) => m[1]));
for (const name of referenced) {
  if (!declared.has(name)) errors.push(`demo.css references undeclared token: ${name}`);
}

if (errors.length) {
  console.error('✘ demo consumer check failed:');
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
console.log(`✔ demo consumer check: ${referenced.size} token references valid, no raw colors`);
