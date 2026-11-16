#!/usr/bin/env node
/**
 * Validates the token source: DTCG 2025.10 value shapes, the resolver
 * document, where tokens may be defined, what they may reference, and that
 * every token resolves to CSS in every combination of contexts.
 *
 *   node scripts/validate.mjs
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CSS_TYPES, cssVar, toCss } from '../lib/css.mjs';
import { TOKENS_ROOT, aliasTarget, flatten, layers, loadResolver, referencesOf, resolveTokens } from '../lib/resolver.mjs';

const TOKEN_KEYS = new Set(['$type', '$value', '$description', '$deprecated', '$extensions']);
const STROKE_STYLES = new Set(['solid', 'dashed', 'dotted', 'double', 'groove', 'ridge', 'outset', 'inset']);
const FONT_WEIGHT_NAMES = new Set([
  'thin', 'hairline', 'extra-light', 'ultra-light', 'light', 'normal', 'regular', 'book', 'medium',
  'semi-bold', 'demi-bold', 'bold', 'extra-bold', 'ultra-bold', 'black', 'heavy', 'extra-black', 'ultra-black',
]);
const isNumber = (n) => typeof n === 'number' && Number.isFinite(n);
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const byteOf = (n) => Math.round(n * 255);

/** Problems with a literal (non-alias) value of a simple type. */
const simple = {
  color(v) {
    if (!isObject(v)) return ['must be a color object'];
    const problems = [];
    if (typeof v.colorSpace !== 'string') problems.push('colorSpace must be a string');
    if (!Array.isArray(v.components) || v.components.length !== 3 || !v.components.every((c) => isNumber(c) || c === 'none')) {
      problems.push('components must be three numbers');
    }
    if (v.alpha !== undefined && !(isNumber(v.alpha) && v.alpha >= 0 && v.alpha <= 1)) problems.push('alpha must be between 0 and 1');
    if (v.hex !== undefined) {
      if (!/^#[0-9a-f]{6}$/.test(v.hex)) problems.push('hex must be six lowercase hex digits');
      else if (v.colorSpace === 'srgb' && Array.isArray(v.components) && v.components.every(isNumber)) {
        const fromComponents = `#${v.components.map((c) => byteOf(c).toString(16).padStart(2, '0')).join('')}`;
        if (fromComponents !== v.hex) problems.push(`hex ${v.hex} disagrees with components (${fromComponents})`);
      }
    }
    for (const key of Object.keys(v)) if (!['colorSpace', 'components', 'alpha', 'hex'].includes(key)) problems.push(`unknown member "${key}"`);
    return problems;
  },
  dimension: (v) => (isObject(v) && isNumber(v.value) && ['px', 'rem'].includes(v.unit) ? [] : ['must be { value, unit: "px" | "rem" }']),
  duration: (v) => (isObject(v) && isNumber(v.value) && ['ms', 's'].includes(v.unit) ? [] : ['must be { value, unit: "ms" | "s" }']),
  number: (v) => (isNumber(v) ? [] : ['must be a number']),
  fontWeight: (v) => ((isNumber(v) && v >= 1 && v <= 1000) || FONT_WEIGHT_NAMES.has(v) ? [] : ['must be 1–1000 or a named weight']),
  fontFamily: (v) =>
    (typeof v === 'string' && v !== '') || (Array.isArray(v) && v.length > 0 && v.every((f) => typeof f === 'string' && f !== ''))
      ? []
      : ['must be a font name or a list of font names'],
  cubicBezier: (v) =>
    Array.isArray(v) && v.length === 4 && v.every(isNumber) && v[0] >= 0 && v[0] <= 1 && v[2] >= 0 && v[2] <= 1
      ? []
      : ['must be four numbers with x coordinates between 0 and 1'],
  strokeStyle: (v) => (STROKE_STYLES.has(v) ? [] : ['must be a named stroke style']),
};

/** Composite types: member name -> simple type. A trailing "?" marks an optional member. */
const composite = {
  border: { color: 'color', width: 'dimension', style: 'strokeStyle' },
  typography: { fontFamily: 'fontFamily', fontSize: 'dimension', fontWeight: 'fontWeight', letterSpacing: 'dimension', lineHeight: 'number' },
  transition: { duration: 'duration', delay: 'duration', timingFunction: 'cubicBezier' },
  shadow: { color: 'color', offsetX: 'dimension', offsetY: 'dimension', blur: 'dimension', spread: 'dimension', 'inset?': 'boolean' },
};
export const TOKEN_TYPES = [...Object.keys(simple).filter((t) => t !== 'strokeStyle'), ...Object.keys(composite)];

/**
 * Problems with a token's raw `$value`, and the type each alias inside it must have.
 * @returns {{ problems: string[], expects: { target: string, type: string }[] }}
 */
export function checkValue(type, value) {
  const whole = aliasTarget(value);
  if (whole !== undefined) return { problems: [], expects: [{ target: whole, type }] };
  if (simple[type]) return { problems: simple[type](value), expects: [] };
  const members = composite[type];
  if (!members) return { problems: [`unknown $type "${type}"`], expects: [] };

  const problems = [];
  const expects = [];
  const layersOf = type === 'shadow' && Array.isArray(value) ? value : [value];
  for (const layer of layersOf) {
    if (!isObject(layer)) {
      problems.push(`must be ${type === 'shadow' ? 'a shadow object or a list of them' : 'an object'}`);
      continue;
    }
    for (const [spec, memberType] of Object.entries(members)) {
      const optional = spec.endsWith('?');
      const key = optional ? spec.slice(0, -1) : spec;
      const member = layer[key];
      if (member === undefined) {
        if (!optional) problems.push(`missing member "${key}"`);
      } else if (memberType === 'boolean') {
        if (typeof member !== 'boolean') problems.push(`"${key}" must be true or false`);
      } else if (aliasTarget(member) !== undefined) {
        expects.push({ target: aliasTarget(member), type: memberType === 'strokeStyle' ? 'strokeStyle' : memberType });
      } else {
        problems.push(...simple[memberType](member).map((p) => `"${key}" ${p}`));
      }
    }
    const known = new Set(Object.keys(members).map((k) => k.replace(/\?$/, '')));
    for (const key of Object.keys(layer)) if (!known.has(key)) problems.push(`unknown member "${key}"`);
  }
  return { problems, expects };
}

export function validate(root = TOKENS_ROOT) {
  const problems = [];
  const report = [];
  const check = (label, found) => {
    report.push(`${found.length ? '✘' : '✔'} ${label}`);
    problems.push(...found.map((problem) => `${label}: ${problem}`));
  };

  // ---- resolver document --------------------------------------------------
  const resolver = loadResolver(root);
  let order = [];
  check(
    'resolver document: version, references, defaults',
    (() => {
      const found = [];
      if (resolver.version !== '2025.10') found.push(`version is ${resolver.version}, expected 2025.10`);
      try {
        order = layers(resolver);
      } catch (error) {
        return [...found, error.message];
      }
      for (const layer of order) {
        const files = layer.kind === 'set' ? layer.files : Object.values(layer.contexts).flat();
        for (const file of files) if (!existsSync(join(root, file))) found.push(`${layer.name}: missing file ${file}`);
        if (layer.kind === 'modifier' && !(layer.default in layer.contexts)) found.push(`${layer.name}: default "${layer.default}" is not one of its contexts`);
      }
      const listed = new Set(order.map((l) => `${l.kind}:${l.name}`));
      for (const name of Object.keys(resolver.sets ?? {})) if (!listed.has(`set:${name}`)) found.push(`set "${name}" is not in resolutionOrder`);
      for (const name of Object.keys(resolver.modifiers ?? {})) if (!listed.has(`modifier:${name}`)) found.push(`modifier "${name}" is not in resolutionOrder`);
      return found;
    })()
  );
  if (problems.length) return { report, problems, counts: { tokens: 0 } };

  // ---- every file: token shape -------------------------------------------
  /** where each token path is defined: [{ kind, name, context?, file, token }] */
  const definitions = new Map();
  const shapeProblems = [];
  for (const layer of order) {
    const groups = layer.kind === 'set' ? [[undefined, layer.files]] : Object.entries(layer.contexts);
    for (const [context, files] of groups) {
      for (const file of files) {
        for (const { path, token } of flatten(JSON.parse(readFileSync(join(root, file), 'utf8')))) {
          const key = path.join('.');
          const where = `${file} ${key}`;
          for (const segment of path) if (/[{}.]/.test(segment)) shapeProblems.push(`${where}: name contains { } or .`);
          for (const k of Object.keys(token)) if (!TOKEN_KEYS.has(k)) shapeProblems.push(`${where}: unknown property "${k}"`);
          if (!TOKEN_TYPES.includes(token.$type)) shapeProblems.push(`${where}: unknown $type "${token.$type}"`);
          else shapeProblems.push(...checkValue(token.$type, token.$value).problems.map((p) => `${where}: ${p}`));
          if (!definitions.has(key)) definitions.set(key, []);
          definitions.get(key).push({ kind: layer.kind, name: layer.name, context, file, token });
        }
      }
    }
  }
  check('tokens: DTCG 2025.10 value shapes, known types, legal names', shapeProblems);

  // ---- one home per token -------------------------------------------------
  check(
    'tokens: each is defined by exactly one set, or by every context of exactly one modifier',
    [...definitions].flatMap(([key, defs]) => {
      const owners = new Set(defs.map((d) => `${d.kind}:${d.name}`));
      if (owners.size > 1) return [`${key}: defined by ${[...owners].join(' and ')}`];
      const [first] = defs;
      if (first.kind === 'set') return defs.length > 1 ? [`${key}: defined ${defs.length} times in set ${first.name}`] : [];
      const layer = order.find((l) => l.kind === 'modifier' && l.name === first.name);
      const missing = Object.keys(layer.contexts).filter((context) => defs.filter((d) => d.context === context).length !== 1);
      return missing.length ? [`${key}: not defined exactly once in ${first.name} context(s) ${missing.join(', ')}`] : [];
    })
  );
  check(
    'tokens: one $type per token across contexts',
    [...definitions].filter(([, defs]) => new Set(defs.map((d) => d.token.$type)).size > 1).map(([key]) => key)
  );

  // ---- references ---------------------------------------------------------
  const ownerOf = (key) => definitions.get(key)?.[0];
  check(
    'aliases: target exists and has the type the position requires',
    [...definitions].flatMap(([key, defs]) =>
      defs.flatMap((def) =>
        checkValue(def.token.$type, def.token.$value).expects.flatMap(({ target, type }) => {
          const owner = ownerOf(target);
          if (!owner) return [`${key} -> {${target}}: no such token`];
          return owner.token.$type === type ? [] : [`${key} -> {${target}}: is ${owner.token.$type}, position needs ${type}`];
        })
      )
    )
  );
  check(
    'aliases: sets do not depend on modifiers, a modifier depends only on sets or itself, base does not depend on functional',
    [...definitions].flatMap(([key, defs]) =>
      defs.flatMap((def) =>
        referencesOf(def.token.$value).flatMap((target) => {
          const owner = ownerOf(target);
          if (!owner) return [];
          if (def.kind === 'set' && owner.kind === 'modifier') return [`${key} (set ${def.name}) -> {${target}} (modifier ${owner.name})`];
          if (def.kind === 'modifier' && owner.kind === 'modifier' && owner.name !== def.name) {
            return [`${key} (modifier ${def.name}) -> {${target}} (modifier ${owner.name})`];
          }
          if (key.startsWith('base.') && !target.startsWith('base.')) return [`${key} -> {${target}}`];
          return [];
        })
      )
    )
  );

  // ---- every combination resolves to CSS ---------------------------------
  const modifierLayers = order.filter((l) => l.kind === 'modifier');
  const combinations = modifierLayers.reduce(
    (all, layer) => all.flatMap((inputs) => Object.keys(layer.contexts).map((context) => ({ ...inputs, [layer.name]: context }))),
    [{}]
  );
  check(
    `resolution: all ${combinations.length} context combinations resolve, and every value has a CSS form`,
    combinations.flatMap((inputs) => {
      const label = Object.entries(inputs).map(([k, v]) => `${k}=${v}`).join(' ');
      try {
        const names = new Set();
        const found = [];
        for (const [key, entry] of resolveTokens(inputs, root)) {
          if (!CSS_TYPES.includes(entry.type)) continue;
          try {
            toCss(entry.type, entry.value);
          } catch (error) {
            found.push(`[${label}] ${key}: ${error.message}`);
          }
          const name = cssVar(entry.path);
          if (names.has(name)) found.push(`[${label}] two tokens share the CSS name ${name}`);
          names.add(name);
        }
        return found;
      } catch (error) {
        return [`[${label}] ${error.message}`];
      }
    })
  );

  return { report, problems, counts: { tokens: definitions.size, combinations: combinations.length } };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { report, problems, counts } = validate();
  console.log(report.join('\n'));
  if (problems.length) {
    console.error(`\n${problems.length} problem(s):\n${problems.slice(0, 40).map((p) => `  - ${p}`).join('\n')}`);
    process.exit(1);
  }
  console.log(`\nTokens valid: ${counts.tokens} tokens, ${counts.combinations} context combinations.`);
}
