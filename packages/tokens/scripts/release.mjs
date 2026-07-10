/**
 * Release orchestrator (docs/versioning.md): verify → classify → version →
 * changelog → commit + tag. Publishing itself happens in CI (release.yml)
 * when the tag is pushed.
 *
 * CLI: node release.mjs [--bump major|minor|patch]
 *   --bump overrides the classifier — for releases whose visual severity
 *   exceeds their structural classification (the "human guards semantics"
 *   half of the policy).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { diffContract, latestTag } from './release-diff.mjs';

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), '..');
// npm run --workspace sets cwd to the package — resolve the repo root and
// run every git/npm command from there so paths mean what they say
const repoRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf8', cwd: pkgDir }).trim();
const run = (cmd, opts = {}) => execSync(cmd, { encoding: 'utf8', stdio: 'inherit', cwd: repoRoot, ...opts });
const capture = (cmd) => execSync(cmd, { encoding: 'utf8', cwd: repoRoot }).trim();

const fail = (msg) => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};

// 1. clean tree — a release must describe exactly what is committed
if (capture('git status --porcelain')) fail('working tree not clean — commit or stash first');

// 2. contract integrity: adapter output must match the committed contract
console.log('verifying contract…');
run('node scripts/import-spectrum.mjs', { cwd: pkgDir, stdio: 'pipe' });
try {
  run('git diff --exit-code packages/tokens/tokens', { stdio: 'pipe' });
} catch {
  fail('contract drift detected — commit regenerated tokens/ first');
}

// 3. build must succeed
console.log('building…');
run('node build.js', { cwd: pkgDir, stdio: 'pipe' });

// 4. classify and compute the next version
const pkgPath = join(pkgDir, 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const tag = latestTag();
let version = pkg.version;
let notes;

if (!tag) {
  // first release: ship the current version as the baseline
  notes = 'Initial release: DTCG contract, Style Dictionary build (CSS/TS/JSON), Figma sync plugin (publish + proposal directions).';
  console.log(`first release — baseline ${version}`);
} else {
  const flagIndex = process.argv.indexOf('--bump');
  const override = flagIndex !== -1 ? process.argv[flagIndex + 1] : null;
  const { bump, markdown, counts } = diffContract(tag);
  if (!bump && !override) fail(`contract unchanged since ${tag} — nothing to release (use --bump to force)`);
  const level = override ?? bump;
  if (override && bump && ['major', 'minor', 'patch'].indexOf(override) > ['major', 'minor', 'patch'].indexOf(bump)) {
    fail(`--bump ${override} is below the classified minimum ${bump}`);
  }
  console.log(`contract diff vs ${tag}: ${JSON.stringify(counts)} → ${level}${override ? ' (overridden)' : ''}`);
  const [maj, min, pat] = version.split('.').map(Number);
  version =
    level === 'major' ? `${maj + 1}.0.0` : level === 'minor' ? `${maj}.${min + 1}.0` : `${maj}.${min}.${pat + 1}`;
  notes = markdown || '_no contract changes — see commit history_';
}

// 5. changelog + version bump
const date = new Date().toISOString().slice(0, 10);
const changelogPath = join(pkgDir, 'CHANGELOG.md');
let changelog = '';
try {
  changelog = readFileSync(changelogPath, 'utf8').replace(/^# Changelog\n\n/, '');
} catch {
  /* first entry */
}
writeFileSync(changelogPath, `# Changelog\n\n## v${version} — ${date}\n\n${notes}\n\n${changelog}`.trimEnd() + '\n');

pkg.version = version;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
run('npm install --package-lock-only', { stdio: 'pipe' });

// 6. commit + tag
run(`git add "${pkgPath}" "${changelogPath}" package-lock.json`);
run(`git commit -m "release: @llp/tokens v${version}"`);
// annotated, not lightweight — `git push --follow-tags` only follows annotated tags
run(`git tag -a v${version} -m "@llp/tokens v${version}"`);

console.log(`\n✅ v${version} tagged. Publish with:\n   git push origin main --follow-tags`);
