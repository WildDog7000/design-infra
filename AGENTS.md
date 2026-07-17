# AGENTS.md — LLP Design System, agent orchestration

You are working with the **LLP design system**. This file is the always-on
layer: rules that apply to every task, no matter what you were asked to build.
Component details are on-demand via MCP (below). Never guess what you can query.

## Always-on foundation rules

These hold for ANY UI you produce. Violating them is a defect even if the
output "looks right".

1. **Never write raw values.** No hex colors (`#fff`), no rgb()/hsl(), no
   pixel values for spacing/radius/font-size. Every visual value comes from a
   `--llp-*` CSS custom property.
2. **Token tier discipline.** Use usage-tier tokens (`--llp-color-accent-bg-default`,
   `--llp-color-neutral-content-default`) first — they encode roles. Only fall
   back to semantic/primitive tiers (`--llp-color-gray-200`) when no usage
   token covers the case, and prefer asking `search_tokens` before deciding
   none exists.
3. **Spacing and radius come from the scale.** `--llp-space-25…1000` and
   `--llp-radius-0…full`. Do not invent in-between values.
4. **Typography**: family `--llp-font-family-sans` (code: `-code`), sizes
   `--llp-font-size-25…1500`, weights `--llp-font-weight-light…black`.
5. **Theming is structural, not stylistic.** Pages include the foundation
   stylesheet once; dark mode = `data-theme="dark"` on `<html>`. Never write
   per-theme color overrides in component or page CSS — if a color doesn't
   flip correctly, the fix belongs in the token contract, not in your output.
6. **Status colors carry meaning.** negative=error, positive=success,
   notice=warning, informative=info. Never use them decoratively.
7. **One accent action per view.** Everything else is secondary; destructive
   actions use negative.

## Components: query, don't invent

Component APIs live in the MCP server (`llp-design-tokens`), tools:

- `list_components` — start here for any page composition
- `get_component` — canonical markup template, modifier classes, inlineable CSS
- `search_tokens` / `resolve_token` / `suggest_token` — token lookup; use
  `suggest_token` to replace any raw color you encounter in inputs

Endpoints:
- **In this repo**: auto-registered via `.mcp.json` (stdio, workspace files)
- **Anywhere else**: `https://llp-design-tokens-mcp.llgffs-d91.workers.dev/mcp`
  (Streamable HTTP; contract freshness = git main + 5-min cache)

Rules:
- Copy markup templates exactly; customize by composing modifier classes
  listed in the registry, not by editing the component CSS.
- Every page inlines `foundation` CSS (get_component slug `foundation`) once,
  then the CSS of each component used.
- If a component you need doesn't exist, compose from existing ones and say
  so explicitly — do not fabricate `llp-*` classes that aren't in the registry.

## Trust levels

Per-action, not per-agent (structurally enforced — the MCP is read-only):

| Action | Level |
|---|---|
| Query tokens/components, compose pages, prototypes | **Autonomous** |
| Token value/contract changes | **Proposal only** — via `packages/tokens/overrides.json` + regenerated contract in a PR (see ADR-0007); never edit `tokens/tokens/**` directly |
| New components, API changes, breaking changes | **Suggest only** — describe the gap (an issue or a `gap:` note), a human decides |
| Merging, releasing, deploying | **Human only** |

## Verification (for agents working in this repo)

Before claiming done: `npm run build` (regenerates + validates everything:
contract drift, registry↔CSS agreement, no raw colors, token existence) and
`npm test`. CI runs the same gates; a change that fails them is not done.

Source of truth map: token contract `packages/tokens/tokens/**` (generated —
edit `overrides.json` or the adapter, never the output) · component registry
`packages/components/registry.json` · deliverables `dist/**` (generated,
committed, drift-checked).
