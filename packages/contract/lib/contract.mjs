/**
 * @lima-design/contract — what an agent is told about Lima, at a chosen level
 * of design intent.
 *
 * The data lives in two independently versioned packages:
 *   @lima-design/tokens             DTCG token files
 *   @lima-design/component-schemas  component API schemas
 *
 * This package adds one thing: the assignment of every field to an intent
 * level (intent-levels.json), and a reader that returns only the fields at or
 * below the level asked for.
 *
 *   import { loadContract } from '@lima-design/contract';
 *   const { tokens, components, versions } = loadContract({ level: 'structure' });
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FORMAT_ID, VERSION as COMPONENT_SCHEMAS_VERSION, loadComponentSchemas } from '@lima-design/component-schemas';
import { VERSION as TOKENS_VERSION, modifiers, tokenCatalog } from '@lima-design/tokens';

export const CONTRACT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export function loadIntentLevels() {
  return JSON.parse(readFileSync(join(CONTRACT_ROOT, 'intent-levels.json'), 'utf8'));
}

export function levelIds() {
  return loadIntentLevels().levels.map((level) => level.id);
}

/** Field names of a record kind (token, component, part, prop) visible at `level`. */
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
  return pick(token, allowedFields('token', level));
}

export function projectComponent(component, level) {
  const propFields = allowedFields('prop', level);
  const partFields = allowedFields('part', level);
  const props = (list) => list.map((prop) => pick(prop, propFields));
  const out = pick(component, allowedFields('component', level));
  if (out.props) out.props = props(out.props);
  for (const key of ['subcomponents', 'types']) {
    if (out[key]) out[key] = out[key].map((part) => ({ ...pick(part, partFields), props: props(part.props) }));
  }
  return out;
}

/** Versions of the data behind the contract. Every answer derived from the contract can cite these. */
export function versions() {
  return { tokens: TOKENS_VERSION, componentSchemas: COMPONENT_SCHEMAS_VERSION, componentSchemaFormat: FORMAT_ID };
}

/**
 * The contract as seen at one intent level.
 * @param {{ level?: string }} [options] defaults to the lowest level, `structure`
 */
export function loadContract({ level = 'structure' } = {}) {
  return {
    level,
    versions: versions(),
    modifiers: modifiers(),
    tokens: tokenCatalog().map((token) => projectToken(token, level)),
    components: loadComponentSchemas().map((component) => projectComponent(component, level)),
  };
}
