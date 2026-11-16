# Lima Design System

A design system built to be consumed by coding agents — and to measure whether
that consumption works: a machine-readable contract, an MCP server that serves
it, and evals that show which information keeps generated UI from drifting.

> This is the `lima` branch, where Lima is being built. An earlier prototype is
> kept on the branch `archive/llp-spectrum-v0`.

## Packages

| Package | What it is | Version |
|---|---|---|
| [`@lima-design/tokens`](packages/tokens) | Design tokens in DTCG 2025.10, with a resolver document for `theme` (light, dark) and `pointer` (fine, coarse) | 0.1.0 |
| [`@lima-design/component-schemas`](packages/component-schemas) | The public API of each component as data, in a versioned format | 0.1.0 |
| [`@lima-design/contract`](packages/contract) | Both of the above, readable at a chosen level of design intent | 0.2.0 |

The two data packages are independent and versioned separately. The contract
depends on them; they do not depend on it.

```
packages/
  tokens/
    lima.resolver.json        how the token files combine
    src/**/*.tokens.json      675 tokens, one per line
  component-schemas/
    schema/component.schema.json   the format (JSON Schema)
    components/*.json              10 components
  contract/
    intent-levels.json        which field belongs to which level of intent
    lib/contract.mjs          loadContract({ level })
```

## Intent levels

Every field of the contract belongs to one level. A consumer asks for a level
and receives that level and everything below it
([ADR-0002](docs/adr/0002-intent-levels-and-gates-vs-evals.md)).

| Level | Content | Data today |
|---|---|---|
| `structure` | names, types, values, references, props signatures, lifecycle status | present |
| `description` | one line on what a token, component or prop is for | to be authored |
| `rules` | usage, do/don't, pairings, accessibility requirements | to be authored |
| `examples` | examples, composition recipes, anti-patterns | to be authored |

The `structure` level is what deterministic gates (lint, type-check) verify, and
the baseline every eval arm shares.

## Use

```bash
npm ci
npm run validate
npm test
```

```js
import { loadContract } from '@lima-design/contract';

const { tokens, components, versions } = loadContract({ level: 'structure' });
```

## Decisions

| ADR | Decision |
|---|---|
| [0001](docs/adr/0001-contract-first-design-system.md) | Lima is a contract-first design system |
| [0002](docs/adr/0002-intent-levels-and-gates-vs-evals.md) | Intent levels; deterministic checks are gates, not evals |
| [0003](docs/adr/0003-tokens-in-dtcg-with-a-resolver.md) | Tokens are authored in DTCG 2025.10 with a resolver document |
| [0004](docs/adr/0004-component-schemas-as-an-independent-package.md) | Component schemas are an independent, versioned package |

## Roadmap

- [x] **Contract, structure level** — tokens, component schemas, intent-level mechanism, validation
- [ ] **Consumer app** — a React app and a runnable `@lima-design/react`
- [ ] **MCP server** — serving the structure level first
- [ ] **Higher intent levels** — description, rules, examples
- [ ] **Gates** — lint rules and a validation tool
- [ ] **Evals** — task × level × repeated runs
- [ ] **Distribution and release** — remote server, versioned releases, cutover to `main`
