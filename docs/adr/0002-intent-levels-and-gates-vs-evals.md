# ADR-0002: Intent levels; deterministic checks are gates, not evals

- Status: accepted (2026-11-16)
- Related: ADR-0001

## Context

To control how far generated UI drifts from the design system, we need to know
**which information, given to an agent, suppresses which kind of drift**. That
requires showing the same contract at different levels of design intent and
running the same tasks against each.

Not every kind of drift deserves an agent eval. A hard-coded color, an invented
prop or a deprecated import can be detected with certainty by a linter or a
type-checker. Designing eval tasks for them wastes the eval budget.

## Decision

### 1. One contract, every field assigned to a level

`packages/contract/intent-levels.json` assigns each field to exactly one level:

| Level | Content | Data today |
|---|---|---|
| `structure` | names, types, values, references, props signatures, lifecycle status | present |
| `description` | one line on what a token, component or prop is for | to be authored |
| `rules` | usage tags, do/don't rules, pairings, when to use and when not to, accessibility requirements | to be authored |
| `examples` | curated examples, composition recipes, anti-patterns | to be authored |

The data packages hold every field. Consumers read through
`loadContract({ level })` and receive the fields at or below that level. Levels
are cumulative, so the difference between two adjacent levels is a known set of
fields and an observed effect can be attributed to it. A field that exists in
the data without a level fails validation.

The data is not duplicated per level: copies of the same facts drift apart.

### 2. Gates and evals

| Drift | Handled by | Means |
|---|---|---|
| Hard-coded values (hex, px) | gate | lint |
| Invented props, deprecated imports | gate | type-check, no-deprecated rule |
| Broken in dark mode | gate | forbid base-tier tokens in product code |
| Styling inside a component | not possible | encapsulated by the component |
| Wrong component, wrong variant | **eval** | task × level × repeated runs |
| Composition and spacing between components | **eval** | same |
| Semantic role misuse | **eval** | same |
| Handling a gap (no component fits) | **eval** | same |

The `structure` level feeds the gates and is the baseline shared by every eval
arm; it is not an experimental variable. Eval arms are: structure only → plus
description → plus rules → plus examples.

### 3. The initial components

Evals target output that is structurally valid but wrong in intent, so the
components were chosen for confusable pairs and for variants that need judgment:

| Component | What it lets us test |
|---|---|
| Button | variant choice (default, primary, danger, invisible, link) |
| TextInput + FormControl | composition; placement of label, caption and validation |
| Dialog | order and emphasis of footer buttons; destructive confirmation |
| Dialog (deprecated) | a gate must tell it apart from the current one |
| Banner + InlineMessage | confusable pair; semantic status |
| ActionMenu + Select | confusable pair: a menu of actions or a choice of value |
| Stack | spacing and layout between components — where agents still write tokens by hand |

## Alternatives considered

- **Separate levels for values and structure.** Both are covered by gates;
  splitting them produces no measurable difference.
- **One complete data set only.** Works, but nothing can be attributed: the
  only possible finding is "it got better".
- **One file per level.** The same fact written four times; replaced by full
  data plus projection at read time.

## Consequences

- Each higher-level field will need at least one eval task that fails without
  it. A field whose removal turns no task red is either useless or untested.
- Model priors raise the no-context baseline: common component names and token
  vocabulary can be guessed. Tasks should hinge on facts specific to Lima — the
  `--lima-` prefix, import paths, deprecations, and Lima's own rules.
- More intent is not automatically better. Higher levels cost more tokens per
  call, and examples invite copying. The result of the evals should be a
  benefit-versus-cost curve, not a winner.
