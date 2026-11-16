/**
 * CSS form of resolved DTCG values, and the CSS name of a token.
 */

export const CSS_PREFIX = '--lima-';

/** ['fgColor', 'muted'] -> 'fgColor-muted' */
export const tokenName = (path) => path.join('-');
/** ['fgColor', 'muted'] -> '--lima-fgColor-muted' */
export const cssVar = (path) => CSS_PREFIX + tokenName(path);

const byte = (n) => Math.round(Math.min(1, Math.max(0, n)) * 255).toString(16).padStart(2, '0');

function color(value) {
  if (value.colorSpace !== 'srgb') throw new Error(`Only srgb colors can be written as CSS hex, got ${value.colorSpace}`);
  const hex = value.hex ?? `#${value.components.map(byte).join('')}`;
  const alpha = value.alpha ?? 1;
  return alpha < 1 ? `${hex}${byte(alpha)}` : hex;
}

const dimension = (value) => `${value.value}${value.unit}`;
const fontFamily = (value) => (Array.isArray(value) ? value : [value]).map((name) => (/^[a-zA-Z-]+$/.test(name) ? name : `"${name}"`)).join(', ');
const cubicBezier = (value) => `cubic-bezier(${value.join(', ')})`;

function shadow(value) {
  return (Array.isArray(value) ? value : [value])
    .map((layer) => `${layer.inset ? 'inset ' : ''}${[layer.offsetX, layer.offsetY, layer.blur, layer.spread].map(dimension).join(' ')} ${color(layer.color)}`)
    .join(', ');
}

const writers = {
  color,
  dimension,
  number: String,
  fontWeight: String,
  fontFamily,
  duration: dimension,
  cubicBezier,
  shadow,
  border: (value) => `${dimension(value.width)} ${value.style} ${color(value.color)}`,
  typography: (value) => `${value.fontWeight} ${dimension(value.fontSize)} / ${value.lineHeight} ${fontFamily(value.fontFamily)}`,
  transition: (value) =>
    [dimension(value.duration), cubicBezier(value.timingFunction), ...(value.delay.value ? [dimension(value.delay)] : [])].join(' '),
};

export const CSS_TYPES = Object.keys(writers);

/**
 * @param {string} type a DTCG `$type`
 * @param {unknown} value a resolved value (no aliases left)
 * @returns {string} what goes after the colon in a CSS declaration
 */
export function toCss(type, value) {
  const write = writers[type];
  if (!write) throw new Error(`No CSS form for token type "${type}"`);
  return write(value);
}
