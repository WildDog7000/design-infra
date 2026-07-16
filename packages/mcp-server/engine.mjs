/**
 * Token contract query engine — pure functions over preloaded DTCG data.
 *
 * No filesystem, no network: callers supply the parsed contract files
 * (ports-and-adapters, same pattern as the ingestion adapter). lib.mjs feeds
 * it from the installed @llp-design/tokens package; the remote worker feeds
 * it from GitHub raw. Token names are DTCG dot-paths
 * (color.accent.bg.default); every result also carries the CSS custom
 * property name consumers actually type (--llp-color-accent-bg-default).
 */

// Tier is a property of which contract file a token lives in — mirror build.js.
export const THEME_SOURCES = {
  light: [
    ['primitive', 'primitives/dimension.json'],
    ['primitive', 'primitives/typography.json'],
    ['primitive', 'primitives/color.light.json'],
    ['semantic', 'semantic/color.json'],
    ['usage', 'usage/color.light.json'],
  ],
  dark: [
    ['primitive', 'primitives/dimension.json'],
    ['primitive', 'primitives/typography.json'],
    ['primitive', 'primitives/color.dark.json'],
    ['semantic', 'semantic/color.json'],
    ['usage', 'usage/color.dark.json'],
  ],
};

export const THEMES = Object.keys(THEME_SOURCES);

/** Every distinct contract file the engine needs, repo-relative to tokens/. */
export const CONTRACT_FILES = [...new Set(Object.values(THEME_SOURCES).flat().map(([, f]) => f))];

export function cssVarName(name) {
  return '--llp-' + name.toLowerCase().replace(/[._]/g, '-');
}

function walk(node, path, tier, inheritedType, out) {
  const type = node.$type ?? inheritedType;
  if ('$value' in node) {
    out.set(path.join('.'), {
      name: path.join('.'),
      value: node.$value,
      type,
      tier,
      ...(node.$description && { description: node.$description }),
    });
    return;
  }
  for (const [key, child] of Object.entries(node)) {
    if (key.startsWith('$') || typeof child !== 'object' || child === null) continue;
    walk(child, [...path, key], tier, type, out);
  }
}

const REF = /^\{([^}]+)\}$/;
const normalize = (s) => s.toLowerCase().replace(/[._\-/\s]+/g, '-');

function parseHex(value) {
  const m = typeof value === 'string' && value.match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

const TIER_RANK = { usage: 0, semantic: 1, primitive: 2 };

/**
 * @param {Record<string, object>} files parsed contract JSON keyed by the
 *   paths in CONTRACT_FILES
 */
export function createEngine(files) {
  for (const file of CONTRACT_FILES) {
    if (!files[file]) throw new Error(`engine needs contract file "${file}"`);
  }

  const themeCache = new Map();

  function loadTheme(theme) {
    if (!THEME_SOURCES[theme]) throw new Error(`unknown theme "${theme}" (expected: ${THEMES.join(', ')})`);
    if (themeCache.has(theme)) return themeCache.get(theme);
    const out = new Map();
    for (const [tier, file] of THEME_SOURCES[theme]) {
      walk(files[file], [], tier, undefined, out);
    }
    themeCache.set(theme, out);
    return out;
  }

  function resolveToken(name, theme) {
    const tokens = loadTheme(theme);
    const chain = [];
    let current = name;
    const seen = new Set();
    for (;;) {
      if (seen.has(current)) throw new Error(`alias cycle at "${current}"`);
      seen.add(current);
      const token = tokens.get(current);
      if (!token) {
        throw new Error(
          chain.length === 0
            ? `token "${name}" not found in theme "${theme}"`
            : `broken alias: "${chain.at(-1).name}" references missing token "${current}"`
        );
      }
      chain.push({ name: token.name, tier: token.tier, cssVar: cssVarName(token.name) });
      const ref = typeof token.value === 'string' && token.value.match(REF);
      if (!ref) return { chain, value: token.value, type: token.type };
      current = ref[1];
    }
  }

  function searchTokens({ query = '', type, tier, theme = 'light', limit = 50 } = {}) {
    const needle = normalize(query);
    const results = [];
    for (const token of loadTheme(theme).values()) {
      if (type && token.type !== type) continue;
      if (tier && token.tier !== tier) continue;
      if (needle && !normalize(token.name).includes(needle)) continue;
      const { value } = resolveToken(token.name, theme);
      results.push({
        name: token.name,
        cssVar: cssVarName(token.name),
        tier: token.tier,
        type: token.type,
        value: token.value,
        resolvedValue: value,
        ...(token.description && { description: token.description }),
      });
      if (results.length >= limit) break;
    }
    return results;
  }

  function suggestToken(color, { theme = 'light', limit = 5 } = {}) {
    const target = parseHex(color);
    if (!target) throw new Error(`"${color}" is not a hex color (expected #rgb, #rrggbb or #rrggbbaa)`);
    const candidates = [];
    for (const token of loadTheme(theme).values()) {
      if (token.type !== 'color') continue;
      const { value } = resolveToken(token.name, theme);
      const rgb = parseHex(value);
      if (!rgb) continue;
      const distance = Math.hypot(...rgb.map((c, i) => c - target[i]));
      candidates.push({
        name: token.name,
        cssVar: cssVarName(token.name),
        tier: token.tier,
        resolvedValue: value,
        exact: distance === 0,
        distance: Math.round(distance * 100) / 100,
      });
    }
    candidates.sort(
      (a, b) => a.distance - b.distance || TIER_RANK[a.tier] - TIER_RANK[b.tier] || a.name.localeCompare(b.name)
    );
    return candidates.slice(0, limit);
  }

  return { loadTheme, resolveToken, searchTokens, suggestToken };
}
