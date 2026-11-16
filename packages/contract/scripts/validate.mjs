#!/usr/bin/env node
/**
 * Validates the contract source files: shape, naming, references, internal
 * consistency of values, and that every field has an intent level.
 *
 *   node scripts/validate.mjs
 */
import { fileURLToPath } from 'node:url';
import { TOKEN_CATEGORIES, loadIntentLevels, loadSource } from '../lib/contract.mjs';

export const CSS_PREFIX = '--lima-';
export const IMPORT_ROOT = '@lima-design/react';
const TOKEN_TYPES = new Set([
  'color', 'dimension', 'number', 'string', 'fontFamily', 'fontWeight', 'typography',
  'duration', 'cubicBezier', 'transition', 'shadow', 'border', 'mediaQuery',
]);
const TIERS = new Set(['base', 'functional']);
const STATUSES = new Set(['draft', 'alpha', 'beta', 'stable', 'deprecated']);

/** @param {ReturnType<typeof loadSource>} [source] */
export function validate(source = loadSource()) {
  const { fields } = loadIntentLevels();
  const problems = [];
  const report = [];
  const check = (label, found) => {
    report.push(`${found.length ? '✘' : '✔'} ${label}`);
    problems.push(...found.map((problem) => `${label}: ${problem}`));
  };
  const unknownFields = (kind, record, where) =>
    Object.keys(record).filter((key) => !(key in fields[kind])).map((key) => `${where}: field "${key}" has no intent level`);

  // ---- tokens -------------------------------------------------------------
  const { tokenFiles, componentFiles } = source;
  const tokens = tokenFiles.flatMap((file) => file.tokens.map((token) => ({ ...token, category: file.category })));
  const themeModes = tokenFiles.find((file) => file.modes)?.modes ?? [];
  const valuesOf = (token) => (token.modes ? Object.entries(token.modes) : [[undefined, token]]);

  check(
    'token files: one per category',
    TOKEN_CATEGORIES.filter((category) => !tokenFiles.some((file) => file.category === category)).map((c) => `missing ${c}.json`)
  );

  check(
    'tokens: every field has an intent level',
    tokens.flatMap((t) => {
      const { category, ...own } = t;
      return [...unknownFields('token', own, t.name), ...valuesOf(t).flatMap(([mode, v]) => (mode ? unknownFields('token', v, `${t.name}/${mode}`) : []))];
    })
  );

  check(
    'tokens: required structure fields, known type and tier',
    tokens.flatMap((t) => {
      const found = [];
      for (const key of ['name', 'path', 'type', 'tier', 'group']) if (t[key] === undefined) found.push(`${t.name}: missing ${key}`);
      if (!TOKEN_TYPES.has(t.type)) found.push(`${t.name}: unknown type "${t.type}"`);
      if (!TIERS.has(t.tier)) found.push(`${t.name}: unknown tier "${t.tier}"`);
      if (Boolean(t.cssVar) === Boolean(t.customMedia)) found.push(`${t.name}: needs exactly one of cssVar / customMedia`);
      if (Boolean(t.modes) === (t.value !== undefined)) found.push(`${t.name}: needs exactly one of value / modes`);
      for (const [mode, v] of valuesOf(t)) {
        if (typeof v.value !== 'string' || v.value === '') found.push(`${t.name}${mode ? `/${mode}` : ''}: value must be a non-empty string`);
        if (v.alias && v.refs) found.push(`${t.name}: alias and refs are mutually exclusive`);
      }
      return found;
    })
  );

  check(
    `tokens: CSS names are "${CSS_PREFIX}" + name, and name is the path joined by "-"`,
    tokens.flatMap((t) => [
      ...((t.cssVar ?? t.customMedia) === CSS_PREFIX + t.name ? [] : [`${t.name}: ${t.cssVar ?? t.customMedia}`]),
      ...(Array.isArray(t.path) && t.path.join('-') === t.name ? [] : [`${t.name}: path is ${JSON.stringify(t.path)}`]),
    ])
  );

  const seen = new Map();
  check(
    'tokens: names are unique (a name may repeat only under different conditions)',
    tokens.flatMap((t) => {
      const key = `${t.name}|${t.condition ?? ''}`;
      if (seen.has(key)) return [`${t.name} appears in ${seen.get(key)} and ${t.category}`];
      seen.set(key, t.category);
      return [];
    })
  );

  check(
    'theme tokens: a value for every mode, and no other',
    tokens
      .filter((t) => t.modes)
      .filter((t) => JSON.stringify(Object.keys(t.modes)) !== JSON.stringify(themeModes))
      .map((t) => `${t.name}: modes are [${Object.keys(t.modes)}], expected [${themeModes}]`)
  );

  // The value a reference target has, as seen from one mode.
  const unconditioned = new Map(tokens.filter((t) => !t.condition).map((t) => [t.name, t]));
  const targetValue = (name, mode) => {
    const target = unconditioned.get(name);
    if (!target) return undefined;
    return target.modes ? target.modes[mode ?? themeModes[0]]?.value : target.value;
  };
  check(
    'tokens: every alias and ref points at an existing token',
    tokens.flatMap((t) =>
      valuesOf(t).flatMap(([, v]) => [...(v.alias ? [v.alias] : []), ...(v.refs ?? [])].filter((n) => !unconditioned.has(n)).map((n) => `${t.name} -> ${n}`))
    )
  );
  check(
    'tokens: an alias has the same value as its target; a composite value contains the values of its refs',
    tokens.flatMap((t) =>
      valuesOf(t).flatMap(([mode, v]) => {
        const where = `${t.name}${mode ? `/${mode}` : ''}`;
        const found = [];
        if (v.alias && targetValue(v.alias, mode) !== undefined && targetValue(v.alias, mode) !== v.value) {
          found.push(`${where}: ${v.value} ≠ ${v.alias} (${targetValue(v.alias, mode)})`);
        }
        for (const ref of v.refs ?? []) {
          const value = targetValue(ref, mode);
          if (value !== undefined && !v.value.includes(value)) found.push(`${where}: does not contain ${ref} (${value})`);
        }
        return found;
      })
    )
  );

  // ---- components ---------------------------------------------------------
  const propProblems = (where, props) => {
    const found = [];
    const names = new Set();
    for (const prop of props ?? []) {
      found.push(...unknownFields('prop', prop, `${where}.${prop.name}`));
      if (typeof prop.name !== 'string' || typeof prop.type !== 'string' || typeof prop.required !== 'boolean') {
        found.push(`${where}.${prop.name}: needs name, type and required`);
      }
      if (names.has(prop.name)) found.push(`${where}: duplicate prop "${prop.name}"`);
      names.add(prop.name);
    }
    return found;
  };

  const ids = new Set();
  check(
    'components: shape, naming and lifecycle',
    componentFiles.flatMap(({ file, component: c }) => {
      const found = unknownFields('component', c, file);
      if (`${c.id}.json` !== file) found.push(`${file}: id is "${c.id}"`);
      if (ids.has(c.id)) found.push(`${file}: duplicate id`);
      ids.add(c.id);
      for (const key of ['name', 'importPath', 'status', 'props', 'subcomponents']) if (c[key] === undefined) found.push(`${file}: missing ${key}`);
      if (!STATUSES.has(c.status)) found.push(`${file}: unknown status "${c.status}"`);
      if (c.importPath !== IMPORT_ROOT && !String(c.importPath).startsWith(`${IMPORT_ROOT}/`)) found.push(`${file}: importPath ${c.importPath}`);
      if ((c.status === 'deprecated') !== (c.importPath === `${IMPORT_ROOT}/deprecated`)) {
        found.push(`${file}: a deprecated component is imported from ${IMPORT_ROOT}/deprecated, and only a deprecated one`);
      }
      found.push(...propProblems(c.id, c.props));
      for (const sub of c.subcomponents ?? []) {
        if (!sub.name.startsWith(`${c.name}.`)) found.push(`${file}: subcomponent "${sub.name}" is not ${c.name}.*`);
        found.push(...propProblems(sub.name, sub.props));
      }
      for (const type of c.types ?? []) found.push(...propProblems(type.name, type.props));
      return found;
    })
  );

  return { report, problems, counts: { tokens: tokens.length, components: componentFiles.length } };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { report, problems, counts } = validate();
  console.log(report.join('\n'));
  if (problems.length) {
    console.error(`\n${problems.length} problem(s):\n${problems.slice(0, 40).map((p) => `  - ${p}`).join('\n')}`);
    process.exit(1);
  }
  console.log(`\nContract valid: ${counts.tokens} tokens, ${counts.components} components.`);
}
