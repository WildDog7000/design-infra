# @lima-design/tokens

The Lima Design System tokens, authored in the
[Design Tokens Format Module 2025.10](https://www.designtokens.org/tr/2025.10/format/)
and combined by a [Resolver](https://www.designtokens.org/tr/2025.10/resolver/) document.

```
lima.resolver.json          how the files combine
src/
  base/*.tokens.json        raw scales (sizes, type scale, durations, easings)
  functional/*.tokens.json  tokens named for their use, independent of context
  theme/light.tokens.json   color, shadow and border tokens, one file per color mode
  theme/dark.tokens.json
  pointer/fine.tokens.json  touch-target and control-spacing tokens, one file per pointer type
  pointer/coarse.tokens.json
```

## Model

- **Sets** (`base`, `functional`) always apply.
- **Modifiers** (`theme`: light | dark, `pointer`: fine | coarse) contribute one context each.
- A token is defined by exactly one set, or by every context of exactly one modifier.
- Token name = path joined by `-`; CSS custom property = `--lima-` + name.
  `fgColor.muted` → `fgColor-muted` → `--lima-fgColor-muted`.
- Tier: paths under `base` are the base tier; everything else is functional.
  Product code uses functional tokens.

Values use the DTCG object forms: colors as `{ colorSpace, components, alpha?, hex }`,
dimensions as `{ value, unit }` (`px` or `rem` only), composites (`border`,
`shadow`, `typography`, `transition`) as objects whose members may be aliases.

## Reading tokens

```js
import { resolveTokens, tokenCatalog, toCss } from '@lima-design/tokens';

// One combination of contexts; omitted modifiers use their default.
const tokens = resolveTokens({ theme: 'dark' });
const muted = tokens.get('fgColor.muted');
toCss(muted.type, muted.value); // '#9198a1'

// One record per token, with its value in every context it varies by.
tokenCatalog().find((t) => t.name === 'fgColor-muted');
// { name, cssVar: '--lima-fgColor-muted', path, type: 'color', tier: 'functional',
//   modifier: 'theme', contexts: { light: { value: '#59636e' }, dark: { value: '#9198a1' } } }
```

A catalog entry also records what the token points at before resolution:
`alias` when the whole value is a reference, `refs` when a composite value
contains references.

## Checks

```bash
npm run validate   # value shapes, resolver document, one home per token, alias types and direction, CSS for every combination
npm test           # includes a conformance test against an independent DTCG parser
```

## Versioning

Semantic versioning, tracked in [CHANGELOG.md](CHANGELOG.md).

| Change | Version |
|---|---|
| Remove or rename a token; change a token's `$type`; remove a modifier or context | major |
| Add a token, a context or a modifier; deprecate a token | minor |
| Change a value; change what a token aliases without changing its meaning | patch |

A value change that alters a token's meaning (for example, a text color that no
longer meets contrast on its intended background) is treated as major.
