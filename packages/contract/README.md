# @lima-design/contract

What an agent is told about Lima, at a chosen level of design intent.

The data lives in two independently versioned packages —
[`@lima-design/tokens`](../tokens) and
[`@lima-design/component-schemas`](../component-schemas). This package adds one
thing: [`intent-levels.json`](intent-levels.json), which assigns every field of
that data to a level, and a reader that returns only the fields at or below the
level asked for.

```js
import { loadContract } from '@lima-design/contract';

const contract = loadContract({ level: 'structure' });
contract.versions;    // { tokens: '0.1.0', componentSchemas: '0.1.0', componentSchemaFormat: 'urn:lima-design:schema:component:1.0.0' }
contract.modifiers;   // { theme: { contexts: ['light', 'dark'], default: 'light' }, pointer: { ... } }
contract.tokens;      // one record per token
contract.components;  // one record per component
```

## Levels

`structure` → `description` → `rules` → `examples`. Levels are cumulative. See
[ADR-0002](../../docs/adr/0002-intent-levels-and-gates-vs-evals.md) for why
they exist and how they are used in evals.

## Rules for consumers

- Read Lima data through `loadContract`. Reading the data packages directly
  bypasses the level and makes results from different levels incomparable.
- Report `versions` alongside anything derived from the contract.

## Checks

```bash
npm run validate   # every field the data can have is assigned a level, and no level names a missing field
npm test
```

Adding a field to a token or to the component schema format without assigning
it a level fails validation here.
