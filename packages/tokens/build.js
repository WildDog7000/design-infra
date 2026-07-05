/**
 * Token build: DTCG source → platform deliverables via Style Dictionary.
 *
 * Theming model (mirrors Spectrum): primitives and usage tokens are
 * theme-scoped, semantic aliases are theme-invariant. Each theme is a
 * separate Style Dictionary build over the matching source set:
 *
 *   light → dist/css/tokens.css        (:root)         + ts + flat json
 *   dark  → dist/css/tokens.dark.css   ([data-theme])  + flat json
 *
 * The dark CSS only re-declares color tokens — dimensions and typography
 * do not vary by theme.
 */
import StyleDictionary from 'style-dictionary';

const COMMON_SOURCES = [
  'tokens/primitives/dimension.json',
  'tokens/primitives/typography.json',
  'tokens/semantic/color.json',
];

const themes = {
  light: {
    source: [...COMMON_SOURCES, 'tokens/primitives/color.light.json', 'tokens/usage/color.light.json'],
    cssFile: 'tokens.css',
    selector: ':root',
  },
  dark: {
    source: [...COMMON_SOURCES, 'tokens/primitives/color.dark.json', 'tokens/usage/color.dark.json'],
    cssFile: 'tokens.dark.css',
    selector: '[data-theme="dark"]',
  },
};

const isColor = (token) => token.$type === 'color';

for (const [theme, { source, cssFile, selector }] of Object.entries(themes)) {
  const sd = new StyleDictionary({
    source,
    log: { verbosity: 'default' },
    platforms: {
      css: {
        transformGroup: 'css',
        prefix: 'llp',
        buildPath: 'dist/css/',
        files: [
          {
            destination: cssFile,
            format: 'css/variables',
            options: { selector, outputReferences: true },
            ...(theme === 'dark' && { filter: isColor }),
          },
        ],
      },
      json: {
        transformGroup: 'js',
        buildPath: 'dist/json/',
        files: [
          {
            destination: theme === 'light' ? 'tokens.flat.json' : `tokens.${theme}.flat.json`,
            format: 'json/flat',
          },
        ],
      },
      ...(theme === 'light' && {
        ts: {
          transformGroup: 'js',
          buildPath: 'dist/ts/',
          files: [
            { destination: 'tokens.js', format: 'javascript/es6' },
            { destination: 'tokens.d.ts', format: 'typescript/es6-declarations' },
          ],
        },
      }),
    },
  });
  await sd.buildAllPlatforms();
  console.log(`✔ built theme: ${theme}`);
}
