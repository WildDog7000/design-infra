/**
 * Node adapter for the query engine: loads the DTCG contract from the
 * @llp-design/tokens dependency (workspace symlink in dev, installed package
 * for npm consumers) and re-exports the engine API bound to it.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { CONTRACT_FILES, createEngine } from './engine.mjs';

export { cssVarName, THEMES, THEME_SOURCES, CONTRACT_FILES } from './engine.mjs';

const require = createRequire(import.meta.url);
const TOKENS_ROOT = join(dirname(require.resolve('@llp-design/tokens/package.json')), 'tokens');

const files = Object.fromEntries(
  CONTRACT_FILES.map((file) => [file, JSON.parse(readFileSync(join(TOKENS_ROOT, file), 'utf8'))])
);

export const { loadTheme, resolveToken, searchTokens, suggestToken } = createEngine(files);
