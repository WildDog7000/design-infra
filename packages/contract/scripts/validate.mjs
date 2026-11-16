#!/usr/bin/env node
/**
 * Validates the intent-level registry against the data it governs: every
 * field the tokens catalog or the component schema format can produce has
 * exactly one level, and the registry names no field that does not exist.
 *
 *   node scripts/validate.mjs
 */
import { fileURLToPath } from 'node:url';
import { loadFormat } from '@lima-design/component-schemas';
import { tokenCatalog } from '@lima-design/tokens';
import { loadIntentLevels } from '../lib/contract.mjs';

/** Intent fields the token catalog emits only once they are authored. */
const TOKEN_INTENT_FIELDS = ['deprecated', 'description', 'usage', 'rules'];

/** Fields each record kind can have, derived from the data packages. */
export function governedFields() {
  const format = loadFormat();
  const keys = (schema) => Object.keys(schema.properties).filter((key) => key !== '$schema');
  return {
    token: [...new Set([...tokenCatalog().flatMap((token) => Object.keys(token)), ...TOKEN_INTENT_FIELDS, 'value', 'alias', 'refs'])],
    component: keys(format),
    part: [...new Set([...keys(format.properties.subcomponents.items), ...keys(format.properties.types.items)])],
    prop: keys(format.$defs.prop),
  };
}

export function validate(registry = loadIntentLevels(), governed = governedFields()) {
  const problems = [];
  const report = [];
  const check = (label, found) => {
    report.push(`${found.length ? '✘' : '✔'} ${label}`);
    problems.push(...found.map((problem) => `${label}: ${problem}`));
  };
  const levels = registry.levels.map((level) => level.id);

  check('levels: ids are unique', levels.filter((id, i) => levels.indexOf(id) !== i));
  check(
    'registry: every assigned level exists',
    Object.entries(registry.fields).flatMap(([kind, fields]) =>
      Object.entries(fields).filter(([, level]) => !levels.includes(level)).map(([field, level]) => `${kind}.${field} -> "${level}"`)
    )
  );
  check(
    'registry: every field the data can have is assigned a level',
    Object.entries(governed).flatMap(([kind, fields]) => fields.filter((field) => !(field in (registry.fields[kind] ?? {}))).map((field) => `${kind}.${field}`))
  );
  check(
    'registry: no level is assigned to a field that does not exist',
    Object.entries(registry.fields).flatMap(([kind, fields]) =>
      Object.keys(fields).filter((field) => !(governed[kind] ?? []).includes(field)).map((field) => `${kind}.${field}`)
    )
  );

  return { report, problems, counts: { fields: Object.values(governed).flat().length, levels: levels.length } };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { report, problems, counts } = validate();
  console.log(report.join('\n'));
  if (problems.length) {
    console.error(`\n${problems.length} problem(s):\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    process.exit(1);
  }
  console.log(`\nIntent levels valid: ${counts.fields} fields across ${counts.levels} levels.`);
}
