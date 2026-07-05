/**
 * Ingestion adapter: @adobe/spectrum-tokens → LLP DTCG source files.
 *
 * Spectrum is the placeholder value source for this pipeline. Swapping to a
 * different source (e.g. our own palette, or Figma Variables in Phase 2) means
 * replacing this adapter — the DTCG files it emits are the pipeline contract.
 *
 * Spectrum's own architecture, which we preserve:
 *   palette (theme-scoped raw values, "sets": light/dark)
 *     → semantic (theme-invariant aliases, e.g. accent-color-800 → blue-800)
 *       → usage (consumer-facing roles, some theme-scoped: background, content…)
 *
 * Emits into tokens/:
 *   primitives/color.light.json, color.dark.json   raw palette per theme
 *   primitives/dimension.json                      spacing + radius
 *   primitives/typography.json                     families, weights, sizes
 *   semantic/color.json                            theme-invariant aliases
 *   usage/color.light.json, color.dark.json        role tokens per theme
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const read = (f) =>
  JSON.parse(readFileSync(require.resolve(`@adobe/spectrum-tokens/src/${f}`), 'utf8'));

const palette = read('color-palette.json');
const semantic = read('semantic-color-palette.json');
const aliases = read('color-aliases.json');
const layout = read('layout.json');
const typography = read('typography.json');

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'tokens');

// ---------------------------------------------------------------------------
// helpers

const rgbToHex = (v) => {
  const m = v.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\)/);
  if (!m) return v;
  const hex = (n) => Number(n).toString(16).padStart(2, '0');
  const a = m[4] !== undefined ? hex(Math.round(Number(m[4]) * 255)) : '';
  return `#${hex(m[1])}${hex(m[2])}${hex(m[3])}${a}`;
};

const themeValue = (token, theme) =>
  token.sets ? token.sets[theme]?.value : token.value;

// set a token at a dot path inside a nested object
const put = (obj, path, token) => {
  const parts = path.split('.');
  let node = obj;
  for (const p of parts.slice(0, -1)) node = node[p] ??= {};
  node[parts.at(-1)] = token;
};

const writeTokens = (relPath, tree) => {
  const file = join(outDir, relPath);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(tree, null, 2) + '\n');
  console.log(`wrote ${relPath}`);
};

// Spectrum token name → our DTCG dot path, for rewriting {refs}.
const refPath = new Map();

const rewriteRef = (value, theme) => {
  const name = value.slice(1, -1);
  if (refPath.has(name)) return `{${refPath.get(name)}}`;
  // referenced token not in our curated set — inline its resolved value
  const target = palette[name] ?? semantic[name] ?? aliases[name];
  if (!target) throw new Error(`unresolvable reference: ${value}`);
  const raw = themeValue(target, theme) ?? target.value;
  return raw.startsWith('{') ? rewriteRef(raw, theme) : rgbToHex(raw);
};

// ---------------------------------------------------------------------------
// 1. primitives/color.{light,dark}.json — curated palette families

const FAMILIES = ['gray', 'blue', 'red', 'green', 'orange'];
const SINGLES = ['white', 'black'];

for (const [name] of Object.entries(palette)) {
  const fam = name.replace(/-\d+$/, '');
  if (FAMILIES.includes(fam) || SINGLES.includes(name)) {
    refPath.set(name, `color.${name.replace(/-(\d+)$/, '.$1')}`);
  }
}

for (const theme of ['light', 'dark']) {
  const tree = { color: { $type: 'color' } };
  for (const [name, path] of refPath) {
    if (!path.startsWith('color.')) continue;
    const value = themeValue(palette[name], theme);
    if (!value) continue;
    put(tree, path, { $value: rgbToHex(value) });
  }
  writeTokens(`primitives/color.${theme}.json`, tree);
}

// ---------------------------------------------------------------------------
// 2. primitives/dimension.json — spacing + corner radius

{
  const tree = { space: { $type: 'dimension' }, radius: { $type: 'dimension' } };
  // two passes: register every name first, so refs between layout tokens
  // (e.g. corner-radius-full → {corner-radius-1000}) can be rewritten
  const entries = [];
  for (const [name, token] of Object.entries(layout)) {
    const sp = name.match(/^spacing-(\d+)$/);
    const cr = name.match(/^corner-radius-(\d+|full)$/);
    if (!sp && !cr) continue;
    const path = sp ? `space.${sp[1]}` : `radius.${cr[1]}`;
    // some layout tokens are desktop/mobile scale-sets; we standardize on desktop
    const raw = typeof token.value === 'string' ? token.value : token.sets?.desktop?.value;
    if (!raw) continue;
    refPath.set(name, path);
    entries.push([path, raw]);
  }
  for (const [path, value] of entries) {
    if (value.startsWith('{')) {
      const target = refPath.get(value.slice(1, -1));
      if (!target) continue;
      put(tree, path, { $value: `{${target}}` });
    } else {
      put(tree, path, { $value: value });
    }
  }
  // spectrum's corner-radius-full is a 0.5 element-height multiplier, which a
  // CSS variable cannot express — emit the standard pill-radius idiom instead
  put(tree, 'radius.full', { $value: '9999px' });
  writeTokens('primitives/dimension.json', tree);
}

// ---------------------------------------------------------------------------
// 3. primitives/typography.json — families, weights, sizes (desktop scale)

{
  const WEIGHTS = { light: 300, regular: 400, medium: 500, bold: 700, 'extra-bold': 800, black: 900 };
  const tree = {
    font: {
      family: { $type: 'fontFamily' },
      weight: { $type: 'fontWeight' },
      size: { $type: 'dimension' },
    },
  };
  const families = {
    sans: ['sans-serif-font-family', ['system-ui', 'sans-serif']],
    serif: ['serif-font-family', ['serif']],
    code: ['code-font-family', ['monospace']],
    cjk: ['cjk-font-family', ['PingFang SC', 'sans-serif']],
  };
  for (const [key, [name, fallbacks]] of Object.entries(families)) {
    const t = typography[name];
    if (!t?.value) continue;
    put(tree, `font.family.${key}`, { $value: [t.value, ...fallbacks] });
    refPath.set(name, `font.family.${key}`);
  }
  for (const [name, num] of Object.entries(WEIGHTS)) {
    if (!typography[`${name}-font-weight`]) continue;
    put(tree, `font.weight.${name}`, { $value: num });
    refPath.set(`${name}-font-weight`, `font.weight.${name}`);
  }
  for (const [name, token] of Object.entries(typography)) {
    const m = name.match(/^font-size-(\d+)$/);
    if (!m) continue;
    put(tree, `font.size.${m[1]}`, { $value: token.sets.desktop.value });
    refPath.set(name, `font.size.${m[1]}`);
  }
  writeTokens('primitives/typography.json', tree);
}

// ---------------------------------------------------------------------------
// 4. semantic/color.json — theme-invariant aliases (accent, informative, …)

{
  const tree = { color: { $type: 'color' } };
  for (const [name, token] of Object.entries(semantic)) {
    const m = name.match(/^([a-z-]+)-color-(\d+)$/);
    if (!m || typeof token.value !== 'string') continue;
    const path = `color.${m[1].replace(/-/g, '_')}.${m[2]}`;
    refPath.set(name, path);
  }
  for (const [name, token] of Object.entries(semantic)) {
    const path = refPath.get(name);
    if (!path || !path.match(/^color\.[a-z_]+\.\d+$/) || palette[name]) continue;
    put(tree, path, { $value: rewriteRef(token.value, 'light') });
  }
  writeTokens('semantic/color.json', tree);
}

// ---------------------------------------------------------------------------
// 5. usage/color.{light,dark}.json — curated consumer-facing roles

const USAGE = {
  'color.bg.base': 'background-base-color',
  'color.bg.elevated': 'background-elevated-color',
  'color.bg.layer_1': 'background-layer-1-color',
  'color.bg.layer_2': 'background-layer-2-color',
  'color.bg.pasteboard': 'background-pasteboard-color',
  'color.accent.bg.default': 'accent-background-color-default',
  'color.accent.bg.hover': 'accent-background-color-hover',
  'color.accent.bg.down': 'accent-background-color-down',
  'color.accent.content.default': 'accent-content-color-default',
  'color.accent.content.hover': 'accent-content-color-hover',
  'color.neutral.bg.default': 'neutral-background-color-default',
  'color.neutral.content.default': 'neutral-content-color-default',
  'color.neutral.subdued_content.default': 'neutral-subdued-content-color-default',
  'color.negative.bg.default': 'negative-background-color-default',
  'color.negative.content.default': 'negative-content-color-default',
  'color.positive.bg.default': 'positive-background-color-default',
  'color.positive.visual': 'positive-visual-color',
  'color.notice.bg.default': 'notice-background-color-default',
  'color.notice.visual': 'notice-visual-color',
  'color.informative.bg.default': 'informative-background-color-default',
  'color.informative.visual': 'informative-visual-color',
  'color.disabled.bg': 'disabled-background-color',
  'color.disabled.content': 'disabled-content-color',
  'color.disabled.border': 'disabled-border-color',
};

for (const theme of ['light', 'dark']) {
  const tree = { color: { $type: 'color' } };
  let missing = 0;
  for (const [path, name] of Object.entries(USAGE)) {
    const token = aliases[name];
    if (!token) {
      console.warn(`  (skip ${name}: not found in color-aliases.json)`);
      missing++;
      continue;
    }
    const raw = themeValue(token, theme);
    const $value = raw.startsWith('{') ? rewriteRef(raw, theme) : rgbToHex(raw);
    put(tree, path, { $value, $description: `spectrum: ${name}` });
  }
  writeTokens(`usage/color.${theme}.json`, tree);
  if (missing) console.warn(`  ${missing} usage tokens skipped (${theme})`);
}

console.log('done.');
