# @lima-design/component-schemas

The public API of each Lima component, as data: where it is imported from, its
lifecycle status, its props (name, TypeScript type, required, default,
deprecation), its subcomponents and the named types its props use.

```
schema/component.schema.json   the format every file follows (JSON Schema 2020-12)
components/<id>.json           one file per component
```

This package has no dependency on any other Lima package, and nothing in it
depends on how the data is delivered or filtered. Tools that serve it (the
contract, the MCP server, linters) depend on it — never the other way round.

## Example

```json
{
  "$schema": "../schema/component.schema.json",
  "id": "select",
  "name": "Select",
  "importPath": "@lima-design/react",
  "status": "alpha",
  "props": [
    { "name": "size", "type": "'small' | 'medium' | 'large'", "required": false }
  ],
  "subcomponents": []
}
```

```js
import { loadComponentSchemas, VERSION, FORMAT_ID } from '@lima-design/component-schemas';
```

## Lifecycle is part of the API

- `status`: `draft` → `alpha` → `beta` → `stable`, or `deprecated`
- `importPath`: `@lima-design/react`, `@lima-design/react/experimental`, or
  `@lima-design/react/deprecated`. A deprecated component is imported from
  `/deprecated`, and only a deprecated one.
- A prop with `"deprecated": true` still works but must not be used in new code.

A replaced component keeps its file under a new id (`dialog_deprecated`) so
tools can tell the current and the old API apart.

## Two versions

| What | Where | Meaning |
|---|---|---|
| **Set version** | `version` in `package.json`, [CHANGELOG.md](CHANGELOG.md) | The component APIs described here |
| **Format version** | `$id` of `schema/component.schema.json` | The shape of a component schema file |

### Set version (semantic versioning)

| Change | Version |
|---|---|
| Remove a component, subcomponent or prop; rename one; narrow a prop type; make a prop required; change a default; move a component to another import path | major |
| Add a component, subcomponent or optional prop; widen a prop type; deprecate a component or prop; advance a status | minor |
| Correct a schema that described the API wrongly | patch |

### Format version

Adding an optional field to the format is a minor format version; removing or
renaming a field, or making one required, is major and is announced in the
changelog before files are migrated.

## Checks

```bash
npm run validate   # format (JSON Schema) + naming, uniqueness, lifecycle consistency
npm test
```
