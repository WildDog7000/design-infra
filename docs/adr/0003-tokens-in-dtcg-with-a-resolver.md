# ADR-0003: Tokens are authored in DTCG 2025.10 with a resolver document

- Status: accepted (2026-11-16)
- Related: ADR-0001

## Context

Tokens need an authoring format. A private JSON shape would be quick, but every
tool that touches tokens — design tools, build tools, linters — would then need
a Lima-specific adapter. The Design Tokens Community Group published the first
stable version of its specification (2025.10), including a Resolver module for
describing themes and other contexts.

## Decision

1. **Format.** Token files follow the Design Tokens Format Module 2025.10:
   `$type` and `$value` on every token, colors as
   `{ colorSpace, components, alpha?, hex }`, dimensions as `{ value, unit }`,
   composite types (`border`, `shadow`, `typography`, `transition`) as objects
   whose members may be aliases, aliases as `{group.token}`.
2. **Contexts via the Resolver module.** `lima.resolver.json` declares two sets
   (`base`, `functional`) and two modifiers: `theme` (light, dark) and `pointer`
   (fine, coarse). A token is defined by exactly one set, or by every context of
   exactly one modifier.
3. **Dependency direction.** Base tokens do not reference functional tokens.
   Sets do not reference modifier tokens. A modifier's tokens reference sets or
   the same modifier only. This keeps "which contexts does this value depend
   on" answerable from where a token is defined.
4. **What the format forbids, Lima does not have.** Dimensions are `px` or
   `rem`; a typography token defines all five members; a transition always has
   a delay. Values that cannot be expressed this way are not tokens.
5. **Explicit `$type` on every token**, not inherited from groups: a token line
   can be read, diffed and validated on its own. Files are written one token
   per line for the same reason.
6. **Intent fields use the format's own extension points**: `$description` for
   the description level; `$extensions["design.lima"]` (`usage`, `rules`) for
   the rules level; `$deprecated` for lifecycle.
7. **Names.** Token names are camelCase path segments (`fgColor.muted`); the
   CSS name is derived, never stored.

## Verification

- `scripts/validate.mjs` checks value shapes, the resolver document, the
  one-home rule, alias target types, dependency direction, and that all four
  context combinations resolve to CSS.
- A conformance test parses the resolver document and every token file with an
  independent DTCG parser and requires it to resolve every combination to the
  same CSS values as this package's own resolver.

## Consequences

- Standard tooling can read the tokens without an adapter; the conformance test
  keeps that true.
- The package implements only the part of the Resolver module that
  `lima.resolver.json` uses (file sources, set and modifier references). Using
  more of the module means extending `lib/resolver.mjs` or adopting a
  third-party resolver.
- Colors are sRGB with a `hex` member. Wide-gamut color needs a CSS writer for
  other color spaces before it can be introduced.
- The independent parser's default lint prefers kebab-case names; that rule is
  turned off in the conformance test because camelCase is a Lima decision.
