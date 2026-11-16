# ADR-0004: Component schemas are an independent, versioned package

- Status: accepted (2026-11-16)
- Related: ADR-0001, ADR-0002

## Context

A component's public API — its props, their types and defaults, its
subcomponents, its lifecycle status — changes on its own schedule: with every
release of the component library. How that API is *shown to agents* (which
fields, at which intent level, through which tool) changes for different
reasons and at a different pace.

Keeping both in one package ties their versions together: a change to how the
contract is filtered would look like a change to component APIs, and a
component API change could not be released or reverted on its own.

## Decision

1. **`@lima-design/component-schemas` is its own package** with no dependency
   on any other Lima package. It contains one schema file per component and the
   format those files follow.
2. **Dependencies point inward.** The contract, the MCP server and linters
   depend on the schemas. The schemas know nothing about intent levels,
   delivery or filtering.
3. **Two versions, kept apart.**
   - *Set version* — the package version. It moves when a component API moves,
     under semantic versioning: removing or narrowing is major, adding or
     deprecating is minor, correcting a wrong description is patch.
   - *Format version* — the `$id` of `schema/component.schema.json`. It moves
     when the shape of a schema file changes.
4. **The format is a JSON Schema (2020-12)** and every component file is
   validated against it. Rules a JSON Schema cannot express (file naming,
   uniqueness, lifecycle consistency) are checked by `scripts/validate.mjs`.
5. **Prop types are TypeScript type strings**, as they appear to a developer.
   Translating them into JSON Schema would lose information (unions of
   components, generics) that agents and reviewers need to read.
6. **Lifecycle is data.** `status` and `importPath` together say whether a
   component may be used; a replaced component keeps a schema under a new id so
   the current and the old API can be told apart by a program.

## Consequences

- A component API change is one reviewable diff with one changelog entry, and
  consumers can pin or upgrade the schemas independently of the tokens.
- Tools report which set version they answered from
  (`loadContract().versions`), so an agent's output can be traced to the API it
  was shown.
- The schemas are currently authored by hand. Once `@lima-design/react` exists,
  they should be checked against its types in CI so the two cannot disagree.
- The format has no field yet for usage rules or examples; adding them is a
  format version change, to be made when that data is authored (ADR-0002).
