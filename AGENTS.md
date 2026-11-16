# AGENTS.md — working in the Lima Design System repo

This file is for agents (and people) changing **this repository**. It is not
the consumer-facing rule set: instructions for agents that *build UI with*
Lima are generated from the contract in a later step and do not exist yet.

## What this repo is

A design system published as data — tokens and component API schemas — in
which every field is tagged with how much design intent it conveys, plus, in
later steps, an MCP server that serves it and evals that measure what each
level of intent buys. Read `docs/adr/` before changing anything structural.

## Source of truth

| Thing | Where |
|---|---|
| Tokens (DTCG 2025.10) | `packages/tokens/src/**/*.tokens.json` — one token per line |
| How token files combine | `packages/tokens/lima.resolver.json` |
| Component API schemas | `packages/component-schemas/components/*.json` |
| Format of a component schema | `packages/component-schemas/schema/component.schema.json` |
| Which field belongs to which intent level | `packages/contract/intent-levels.json` |
| How consumers read all of it | `loadContract({ level })` in `packages/contract` |

These files are authored, not generated. There is no build step.

## Rules

1. **Everything in this repository is written in English**: code, data,
   documentation, commit messages, pull requests.
2. **Dependencies point one way.** `tokens` and `component-schemas` depend on
   no other Lima package. `contract` depends on both. Never the reverse.
3. **Assign a level before adding a field.** A field that exists in the data
   without an entry in `intent-levels.json` fails validation.
4. **Consumers go through `loadContract`.** Nothing outside the data packages
   reads their JSON directly.
5. **Names follow the scheme.** CSS names are `--lima-` + the token path joined
   by `-`. Components import from `@lima-design/react` (`/experimental`,
   `/deprecated`).
6. **A token has one home**: one set, or every context of one modifier.
   Base does not reference functional; sets do not reference modifiers.
7. **Version what you change.** A change to tokens or to component schemas
   updates that package's `version` and `CHANGELOG.md` according to the policy
   in its README.
8. **Do not invent.** No values, props or types the design system has not
   decided. A gap is reported, not filled.

## Verification

Before claiming done:

```bash
npm run validate   # all three packages
npm test
```

CI runs the same two gates. A change that fails them is not done.

## Trust levels

| Action | Level |
|---|---|
| Read the data, run validate / tests | **Autonomous** |
| Change tooling (`lib/`, `scripts/`, tests) | **Proposal** — on a branch, via PR into `lima` |
| Change a token, a component schema, the schema format, or a field's intent level | **Proposal, flagged** — these are design decisions; say so in the PR |
| Merging, releasing, deploying, switching `main` over | **Human only** |
