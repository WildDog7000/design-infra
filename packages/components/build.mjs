/**
 * Component library build: validate, then emit committed deliverables.
 *
 *  1. registry ↔ css agreement: every class the registry's markup/variants
 *     mention must exist in that component's stylesheet
 *  2. consumer guard (same contract as the demo): no raw color values in
 *     component CSS; every var(--llp-*) must exist in the built tokens CSS
 *  3. emit dist/foundation.css (tokens light+dark, for page inlining) and
 *     dist/components.css (all components bundled)
 *
 * dist/ is committed — like the token contract, deliverables are diffable
 * and CI re-runs this build to catch drift.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const registry = JSON.parse(readFileSync(join(here, 'registry.json'), 'utf8'));

// resolve the tokens deliverables through the dependency, so npm builds the
// workspaces in the right order and the path holds outside this repo too
const require = createRequire(import.meta.url);
const tokensCssLight = readFileSync(require.resolve('@llp-design/tokens/css'), 'utf8');
const tokensCssDark = readFileSync(require.resolve('@llp-design/tokens/css/dark'), 'utf8');
const declared = new Set([...(tokensCssLight + tokensCssDark).matchAll(/(--llp-[\w-]+)\s*:/g)].map((m) => m[1]));

const errors = [];
let bundle = '';
let tokenRefs = 0;

for (const component of registry.components) {
  const css = readFileSync(join(here, component.cssFile), 'utf8');
  const cssNoComments = css.replace(/\/\*[\s\S]*?\*\//g, '');

  // 1. registry ↔ css: classes referenced in markup + variants + sizes exist
  const referencedClasses = new Set([
    ...[...component.markup.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/)),
    ...Object.keys(component.variants ?? {}),
    ...(component.sizes ?? []),
  ]);
  for (const cls of referencedClasses) {
    if (!cls.startsWith('llp-')) continue; // foreign classes (none expected) or plain tags
    if (!cssNoComments.includes(`.${cls}`) && !bundle.includes(`.${cls}`)) {
      errors.push(`${component.slug}: class "${cls}" referenced in registry but not found in CSS`);
    }
  }

  // 2a. no raw colors
  const rawColor = cssNoComments.match(/#[0-9a-fA-F]{3,8}\b|\b(?:rgb|hsl)a?\(/g);
  if (rawColor) errors.push(`${component.slug}: raw color values: ${[...new Set(rawColor)].join(', ')}`);

  // 2b. every token reference exists in the built contract
  for (const [, name] of cssNoComments.matchAll(/var\((--llp-[\w-]+)\)/g)) {
    tokenRefs++;
    if (!declared.has(name)) errors.push(`${component.slug}: undeclared token ${name}`);
  }

  bundle += `\n/* ---- ${component.name} (${component.cssFile}) ---- */\n` + css;
}

if (errors.length) {
  console.error('✘ component build failed:');
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}

mkdirSync(join(here, 'dist'), { recursive: true });
writeFileSync(
  join(here, 'dist/foundation.css'),
  '/* LLP foundation: design tokens, light (:root) + dark ([data-theme="dark"]). Generated — do not edit. */\n' +
    tokensCssLight +
    '\n' +
    tokensCssDark
);
writeFileSync(
  join(here, 'dist/components.css'),
  '/* LLP components bundle. Generated — do not edit. Requires foundation.css. */\n' + bundle
);

console.log(
  `✔ components build: ${registry.components.length} components, ${tokenRefs} token refs valid, no raw colors`
);
