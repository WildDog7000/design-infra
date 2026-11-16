# AGENTS.md — working in the Lima Design System repo

This file is for agents (and people) changing **this repository**. It is not
the consumer-facing rule set: instructions for agents that *build UI with*
Lima are generated from the contract in a later step and do not exist yet.

## What this repo is

A design-system contract (tokens + component APIs as data) in which every
field is tagged with how much design intent it conveys, plus — in later steps —
an MCP server that serves it and evals that measure what each level of intent
buys. Read `docs/adr/0012-*.md` and `docs/adr/0013-*.md` before changing
anything structural.

## Source of truth

| Thing | Where |
|---|---|
| Tokens | `packages/contract/tokens/*.json` — one token per line |
| Component APIs | `packages/contract/components/*.json` — one file per component |
| Which field belongs to which intent level | `packages/contract/intent-levels.json` |
| How consumers read the contract | `loadContract({ level })` in `packages/contract/lib/contract.mjs` |

These files are authored, not generated. There is no build step.

## Rules

1. **Register a field before using it.** A field that is not in
   `intent-levels.json` fails validation. Decide which level it belongs to first.
2. **Consumers go through `loadContract`.** Nothing outside this package reads
   the JSON files directly; that is what keeps a level's view free of
   higher-level fields.
3. **Names follow the scheme.** CSS names are `--lima-` + token name; the token
   name is its path joined by `-`; components import from `@lima-design/react`
   (deprecated ones from `@lima-design/react/deprecated`).
4. **Keep references true.** An alias must have the same value as its target in
   every mode. Change the target, and every alias of it changes with it.
5. **Do not invent.** No values, props or types that the design system has not
   decided. A gap is reported, not filled.

## Verification

Before claiming done:

```bash
npm run validate   # shape, naming, references, value consistency, intent levels
npm test
```

CI runs the same two gates. A change that fails them is not done.

## Trust levels

| Action | Level |
|---|---|
| Read the contract, run validate / tests | **Autonomous** |
| Change tooling (`lib/`, `scripts/`, tests) | **Proposal** — on a branch, via PR into `lima` |
| Change a token value, a component API, or a field's intent level | **Proposal, flagged** — these are design decisions; say so in the PR |
| Merging, releasing, deploying, switching `main` over | **Human only** |
