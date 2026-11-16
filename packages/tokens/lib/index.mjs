/**
 * @lima-design/tokens — the Lima design tokens.
 *
 * The source is DTCG 2025.10 token files combined by lima.resolver.json.
 * Two ways to read them:
 *
 *   resolveTokens({ theme: 'dark' })   one resolved value per token, for one combination of contexts
 *   tokenCatalog()                     one record per token, with its value in every context it varies by
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cssVar, toCss, tokenName } from './css.mjs';
import { TOKENS_ROOT, aliasTarget, loadResolver, modifiers, referencesOf, resolveTokens } from './resolver.mjs';

export { CSS_PREFIX, cssVar, toCss, tokenName } from './css.mjs';
export { TOKENS_ROOT, flatten, layers, loadResolver, modifiers, referencesOf, resolveTokens } from './resolver.mjs';

export const VERSION = JSON.parse(readFileSync(join(TOKENS_ROOT, 'package.json'), 'utf8')).version;

const nameOf = (dotted) => dotted.split('.').join('-');

/** { value, alias?, refs? } — the CSS value, and what the token points at before resolution. */
function describe(entry) {
  const alias = aliasTarget(entry.token.$value);
  const refs = alias ? [] : referencesOf(entry.token.$value);
  return {
    value: toCss(entry.type, entry.value),
    ...(alias && { alias: nameOf(alias) }),
    ...(refs.length > 0 && { refs: refs.map(nameOf) }),
  };
}

/**
 * One record per token.
 *
 * A token that is the same in every context has `value` (and `alias` / `refs`).
 * A token defined by a modifier has `modifier` and `contexts` instead, with one
 * `{ value, alias?, refs? }` per context of that modifier.
 *
 * Intent fields are included when present in the source: `description`
 * (`$description`), `usage` and `rules` (`$extensions["design.lima"]`).
 */
export function tokenCatalog(root = TOKENS_ROOT) {
  const resolver = loadResolver(root);
  const defaults = resolveTokens({}, root);
  const perModifier = Object.fromEntries(
    Object.entries(modifiers(resolver)).map(([name, { contexts }]) => [
      name,
      Object.fromEntries(contexts.map((context) => [context, resolveTokens({ [name]: context }, root)])),
    ])
  );

  const catalog = [];
  for (const [key, entry] of defaults) {
    const { token, path, origin } = entry;
    const lima = token.$extensions?.['design.lima'] ?? {};
    const record = {
      name: tokenName(path),
      cssVar: cssVar(path),
      path,
      type: entry.type,
      tier: path[0] === 'base' ? 'base' : 'functional',
      ...(token.$deprecated !== undefined && { deprecated: token.$deprecated }),
      ...(token.$description !== undefined && { description: token.$description }),
      ...(lima.usage !== undefined && { usage: lima.usage }),
      ...(lima.rules !== undefined && { rules: lima.rules }),
    };
    if (origin.kind === 'modifier') {
      record.modifier = origin.name;
      record.contexts = Object.fromEntries(
        Object.entries(perModifier[origin.name]).map(([context, tokens]) => [context, describe(tokens.get(key))])
      );
    } else {
      Object.assign(record, describe(entry));
    }
    catalog.push(record);
  }
  return catalog.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}
