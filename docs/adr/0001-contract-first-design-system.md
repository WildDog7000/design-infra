# ADR-0001: Lima is a contract-first design system

- Status: accepted (2026-11-16)

## Context

Lima exists to answer a practical question: what does a design system have to
publish so that coding agents build UI with it correctly, and how do we know
it is working?

A design system that agents consume is judged on the data it exposes, not on
its documentation site. That data has to exist before the tooling around it,
and it has to be precise enough that a program can check an agent's output
against it.

## Decision

1. **The contract is the source of truth.** Tokens and component APIs are
   authored as data files in this repository. There is no upstream and no
   generation step: changing a design decision means changing these files in a
   pull request.
2. **The contract precedes the implementation.** `@lima-design/react` is
   specified here before it is built. The contract is the specification the
   implementation must satisfy, not documentation extracted from it.
3. **Scope.** Web, React. Two color modes (light, dark). Base and functional
   token tiers; tokens internal to a component's implementation are not part of
   the public contract. An initial set of ten components (ADR-0002 explains the
   selection).
4. **Naming.**
   - CSS custom properties: `--lima-` + token name; the token name is the token
     path joined by `-`.
   - Components are imported from `@lima-design/react`; experimental APIs from
     `/experimental`, deprecated components from `/deprecated`.
   - Packages are scoped `@lima-design/*` and stay private until a first release.
5. **Data packages are independent.** Tokens (ADR-0003) and component schemas
   (ADR-0004) are separate packages with their own versions. What an agent is
   shown is assembled from them by the contract package (ADR-0002).

## Consequences

- Every claim an agent-facing tool makes about Lima can be traced to a line in
  a data file and to a package version.
- Type-level gates (does this prop exist, is this import deprecated) need the
  React implementation, which does not exist yet. Until then, only data-level
  gates are possible.
- The repository history before this decision describes an earlier prototype;
  it is kept on the branch `archive/llp-spectrum-v0`.
