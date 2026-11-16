# Changelog — @lima-design/tokens

All notable changes to the Lima tokens. Versioning policy: see [README.md](README.md#versioning).

## 0.1.0

Initial token set.

- 675 tokens in DTCG 2025.10 format: base scales (size, type, motion) and
  functional tokens (color, border, shadow, size, spacing, typography, motion)
- Resolver document with two modifiers: `theme` (light, dark) and `pointer` (fine, coarse)
- CSS custom properties are named `--lima-` + token name
- Library: `resolveTokens`, `tokenCatalog`, `toCss`
