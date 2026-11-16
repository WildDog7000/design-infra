/**
 * The Lima Design System contract as data.
 *
 * The files under tokens/ and components/ are the source of truth and hold
 * every field Lima knows. Consumers never read them directly: they ask for
 * the contract at an intent level and get only the fields at or below it.
 *
 *   import { loadContract } from '@lima-design/contract';
 *   const { tokens, components } = loadContract({ level: 'structure' });
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CONTRACT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const TOKEN_CATEGORIES = ['theme', 'size', 'spacing', 'typography', 'motion'];

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

export function loadIntentLevels() {
  return readJson(join(CONTRACT_ROOT, 'intent-levels.json'));
}

export function levelIds() {
  return loadIntentLevels().levels.map((level) => level.id);
}

/** Field names of a record kind (token, component, prop) visible at `level`. */
export function allowedFields(kind, level) {
  const { fields } = loadIntentLevels();
  const order = levelIds();
  const max = order.indexOf(level);
  if (max < 0) throw new Error(`Unknown intent level "${level}". Known levels: ${order.join(', ')}`);
  if (!fields[kind]) throw new Error(`Unknown record kind "${kind}"`);
  return new Set(
    Object.entries(fields[kind])
      .filter(([, fieldLevel]) => order.indexOf(fieldLevel) <= max)
      .map(([field]) => field)
  );
}

const pick = (record, allowed) => Object.fromEntries(Object.entries(record).filter(([key]) => allowed.has(key)));

export function projectToken(token, level) {
  const allowed = allowedFields('token', level);
  const out = pick(token, allowed);
  if (out.modes) out.modes = Object.fromEntries(Object.entries(out.modes).map(([mode, value]) => [mode, pick(value, allowed)]));
  return out;
}

export function projectComponent(component, level) {
  const propFields = allowedFields('prop', level);
  const props = (list) => list.map((prop) => pick(prop, propFields));
  const out = pick(component, allowedFields('component', level));
  if (out.props) out.props = props(out.props);
  for (const key of ['subcomponents', 'types']) {
    if (out[key]) out[key] = out[key].map((part) => ({ ...part, props: props(part.props) }));
  }
  return out;
}

/** Source files, unprojected. For validation and authoring tools — not for consumers. */
export function loadSource() {
  const tokenFiles = TOKEN_CATEGORIES.map((category) => readJson(join(CONTRACT_ROOT, 'tokens', `${category}.json`)));
  const componentDir = join(CONTRACT_ROOT, 'components');
  const componentFiles = readdirSync(componentDir)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({ file, component: readJson(join(componentDir, file)) }));
  return { tokenFiles, componentFiles };
}

/**
 * The contract as seen at one intent level.
 * @param {{ level?: string }} [options] defaults to the lowest level, `structure`
 */
export function loadContract({ level = 'structure' } = {}) {
  const { tokenFiles, componentFiles } = loadSource();
  return {
    level,
    modes: tokenFiles.find((file) => file.modes)?.modes ?? [],
    tokens: tokenFiles.flatMap((file) => file.tokens.map((token) => ({ category: file.category, ...projectToken(token, level) }))),
    components: componentFiles.map(({ component }) => projectComponent(component, level)),
  };
}
