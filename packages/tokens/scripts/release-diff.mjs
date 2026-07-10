/**
 * Release classifier: diff the DTCG contract between a git ref and the
 * working tree, and classify the implied semver bump (docs/versioning.md):
 *
 *   removed / renamed / $type changed  → major   (references break)
 *   added                              → minor   (pure addition)
 *   $value changed                     → patch   (references still resolve)
 *
 * The machine guards the structural contract only; visual severity is a
 * human judgement made in PR review — the suggested bump is a floor.
 *
 * CLI: node release-diff.mjs [--from <ref>]   (default: latest v* tag)
 */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FILES = [
  'primitives/color.light.json',
  'primitives/color.dark.json',
  'primitives/dimension.json',
  'primitives/typography.json',
  'semantic/color.json',
  'usage/color.light.json',
  'usage/color.dark.json',
];

const REPO_PREFIX = 'packages/tokens/tokens/';
const tokensDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'tokens');

const git = (cmd) => execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });

// DTCG tree → { 'a.b.c': { type, value } }, $type inherited from ancestors
const flatten = (node, path, inheritedType, out) => {
  const type = node.$type ?? inheritedType;
  for (const [key, child] of Object.entries(node)) {
    if (key.startsWith('$') || typeof child !== 'object' || child === null) continue;
    if ('$value' in child) {
      out[[...path, key].join('.')] = { type: child.$type ?? type, value: child.$value };
    } else {
      flatten(child, [...path, key], type, out);
    }
  }
  return out;
};

const readTree = (file, ref) => {
  try {
    const raw = ref
      ? git(`git show ${ref}:${REPO_PREFIX}${file}`)
      : readFileSync(join(tokensDir, file), 'utf8');
    return flatten(JSON.parse(raw), [], null, {});
  } catch {
    return {}; // file absent on that side — every token counts as added/removed
  }
};

export const latestTag = () => {
  try {
    return git('git describe --tags --abbrev=0 --match "v*"').trim();
  } catch {
    return null;
  }
};

const show = (v) => (typeof v === 'string' ? v : JSON.stringify(v));

export function diffContract(fromRef) {
  const removed = [];
  const retyped = [];
  const added = [];
  const changed = [];

  for (const file of FILES) {
    const before = readTree(file, fromRef);
    const after = readTree(file, null);
    for (const name of Object.keys(before)) {
      if (!(name in after)) removed.push({ file, name });
    }
    for (const [name, token] of Object.entries(after)) {
      if (!(name in before)) {
        added.push({ file, name });
      } else if (before[name].type !== token.type) {
        retyped.push({ file, name, from: before[name].type, to: token.type });
      } else if (JSON.stringify(before[name].value) !== JSON.stringify(token.value)) {
        changed.push({ file, name, from: before[name].value, to: token.value });
      }
    }
  }

  const bump =
    removed.length || retyped.length ? 'major' : added.length ? 'minor' : changed.length ? 'patch' : null;

  const lines = [];
  if (removed.length || retyped.length) {
    lines.push('### Breaking');
    for (const t of removed) lines.push(`- removed \`${t.name}\` (${t.file})`);
    for (const t of retyped) lines.push(`- \`${t.name}\` retyped ${t.from} → ${t.to} (${t.file})`);
  }
  if (added.length) {
    lines.push('### Added');
    for (const t of added) lines.push(`- \`${t.name}\` (${t.file})`);
  }
  if (changed.length) {
    lines.push('### Changed');
    for (const t of changed) lines.push(`- \`${t.name}\`: \`${show(t.from)}\` → \`${show(t.to)}\` (${t.file})`);
  }

  return { bump, markdown: lines.join('\n'), counts: { removed: removed.length, retyped: retyped.length, added: added.length, changed: changed.length } };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const flagIndex = process.argv.indexOf('--from');
  const from = flagIndex !== -1 ? process.argv[flagIndex + 1] : latestTag();
  if (!from) {
    console.error('no v* tag found — pass --from <ref>');
    process.exit(1);
  }
  const { bump, markdown, counts } = diffContract(from);
  console.log(`contract diff vs ${from}:`, JSON.stringify(counts));
  console.log(`suggested bump: ${bump ?? 'none (contract unchanged)'}`);
  if (markdown) console.log('\n' + markdown);
}
