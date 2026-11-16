/**
 * Reads the Lima token files the way the DTCG 2025.10 Resolver module
 * describes: apply every set, then one context per modifier, in
 * `resolutionOrder`; later sources override earlier ones token by token.
 *
 * Only the parts of the Resolver module that lima.resolver.json uses are
 * implemented: file references, `#/sets/<name>` and `#/modifiers/<name>`.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TOKENS_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const RESOLVER_FILE = 'lima.resolver.json';

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const ALIAS = /^\{([^{}]+)\}$/;

export const isToken = (node) => node !== null && typeof node === 'object' && !Array.isArray(node) && '$value' in node;
export const aliasTarget = (value) => (typeof value === 'string' ? ALIAS.exec(value)?.[1] : undefined);

export function loadResolver(root = TOKENS_ROOT) {
  return readJson(join(root, RESOLVER_FILE));
}

/** Every token in a token file, as { path: string[], token } in document order. */
export function flatten(tree, path = []) {
  const found = [];
  for (const [key, node] of Object.entries(tree)) {
    if (key.startsWith('$')) continue;
    if (isToken(node)) found.push({ path: [...path, key], token: node });
    else if (node && typeof node === 'object') found.push(...flatten(node, [...path, key]));
  }
  return found;
}

function sourceFiles(sources) {
  return sources.map((source) => {
    if (typeof source?.$ref !== 'string' || source.$ref.startsWith('#')) {
      throw new Error(`Only file references are supported as sources, got ${JSON.stringify(source)}`);
    }
    return source.$ref;
  });
}

/**
 * The layers of the resolver document in resolution order.
 * @returns {{ kind: 'set' | 'modifier', name: string, default?: string, contexts?: Record<string, string[]>, files?: string[] }[]}
 */
export function layers(resolver = loadResolver()) {
  return resolver.resolutionOrder.map((entry) => {
    const match = /^#\/(sets|modifiers)\/(.+)$/.exec(entry?.$ref ?? '');
    if (!match) throw new Error(`Unsupported resolutionOrder entry: ${JSON.stringify(entry)}`);
    const [, kind, name] = match;
    const definition = resolver[kind]?.[name];
    if (!definition) throw new Error(`resolutionOrder refers to a missing ${kind.slice(0, -1)}: ${name}`);
    if (kind === 'sets') return { kind: 'set', name, files: sourceFiles(definition.sources) };
    const contexts = Object.fromEntries(Object.entries(definition.contexts).map(([context, sources]) => [context, sourceFiles(sources)]));
    return { kind: 'modifier', name, default: definition.default, contexts };
  });
}

/** Modifier names with their contexts and default, e.g. { theme: { contexts: ['light', 'dark'], default: 'light' } }. */
export function modifiers(resolver = loadResolver()) {
  return Object.fromEntries(
    layers(resolver)
      .filter((layer) => layer.kind === 'modifier')
      .map((layer) => [layer.name, { contexts: Object.keys(layer.contexts), default: layer.default }])
  );
}

function resolveValue(value, lookup, type, trail) {
  const target = aliasTarget(value);
  if (target !== undefined) {
    if (trail.includes(target)) throw new Error(`Circular alias: ${[...trail, target].join(' -> ')}`);
    const entry = lookup.get(target);
    if (!entry) throw new Error(`Alias to a token that does not exist: {${target}} (from ${trail.at(-1)})`);
    return resolveValue(entry.token.$value, lookup, entry.token.$type, [...trail, target]);
  }
  if (Array.isArray(value)) return value.map((item) => resolveValue(item, lookup, type, trail));
  // A color or dimension object is a leaf; only composite members can hold aliases.
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, member]) => [key, resolveValue(member, lookup, type, trail)]));
  }
  return value;
}

/** Names of the tokens a raw `$value` points at, in order of first appearance. */
export function referencesOf(value) {
  const target = aliasTarget(value);
  if (target !== undefined) return [target];
  if (Array.isArray(value)) return [...new Set(value.flatMap(referencesOf))];
  if (value && typeof value === 'object') return [...new Set(Object.values(value).flatMap(referencesOf))];
  return [];
}

/**
 * Resolve the tokens for one combination of modifier contexts.
 *
 * @param {Record<string, string>} [inputs] e.g. { theme: 'dark', pointer: 'coarse' }; omitted modifiers use their default
 * @returns {Map<string, { path: string[], type: string, token: object, value: unknown, origin: { kind: string, name: string, context?: string, file: string } }>}
 *   keyed by the dotted token path; `token` is the raw token, `value` has every alias replaced
 */
export function resolveTokens(inputs = {}, root = TOKENS_ROOT) {
  const resolver = loadResolver(root);
  const order = layers(resolver);
  const known = order.filter((layer) => layer.kind === 'modifier').map((layer) => layer.name);
  for (const name of Object.keys(inputs)) {
    if (!known.includes(name)) throw new Error(`Unknown modifier "${name}". Known modifiers: ${known.join(', ')}`);
  }

  const merged = new Map();
  for (const layer of order) {
    let files = layer.files;
    let context;
    if (layer.kind === 'modifier') {
      context = inputs[layer.name] ?? layer.default;
      files = layer.contexts[context];
      if (!files) {
        throw new Error(`Unknown context "${context}" for modifier "${layer.name}". Known contexts: ${Object.keys(layer.contexts).join(', ')}`);
      }
    }
    for (const file of files) {
      for (const { path, token } of flatten(readJson(join(root, file)))) {
        merged.set(path.join('.'), { path, token, origin: { kind: layer.kind, name: layer.name, ...(context && { context }), file } });
      }
    }
  }

  const resolved = new Map();
  for (const [key, entry] of merged) {
    resolved.set(key, { ...entry, type: entry.token.$type, value: resolveValue(entry.token.$value, merged, entry.token.$type, [key]) });
  }
  return resolved;
}
