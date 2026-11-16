#!/usr/bin/env node
/**
 * Validates every component schema file against the format
 * (schema/component.schema.json) and against the rules a JSON Schema cannot
 * express: file naming, uniqueness, and lifecycle consistency.
 *
 *   node scripts/validate.mjs
 */
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { loadComponentSchemaFiles, loadFormat } from '../lib/index.mjs';

/** @param {{ file: string, schema: object }[]} [files] */
export function validate(files = loadComponentSchemaFiles()) {
  const problems = [];
  const report = [];
  const check = (label, found) => {
    report.push(`${found.length ? '✘' : '✔'} ${label}`);
    problems.push(...found.map((problem) => `${label}: ${problem}`));
  };

  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const matchesFormat = ajv.compile(loadFormat());
  check(
    'format: every file follows schema/component.schema.json',
    files.flatMap(({ file, schema }) =>
      matchesFormat(schema) ? [] : matchesFormat.errors.map((e) => `${file}${e.instancePath || ''} ${e.message}${e.params?.additionalProperty ? ` "${e.params.additionalProperty}"` : ''}`)
    )
  );

  const ids = new Map();
  check(
    'identity: id equals the file name, ids are unique',
    files.flatMap(({ file, schema: c }) => {
      const found = [];
      if (`${c.id}.json` !== file) found.push(`${file}: id is "${c.id}"`);
      if (ids.has(c.id)) found.push(`${file}: id "${c.id}" is also used by ${ids.get(c.id)}`);
      ids.set(c.id, file);
      return found;
    })
  );
  check(
    'identity: a component name is exported at most once per import path',
    (() => {
      const seen = new Map();
      return files.flatMap(({ file, schema: c }) => {
        const key = `${c.importPath}#${c.name}`;
        if (seen.has(key)) return [`${file}: ${c.name} from ${c.importPath} is also described by ${seen.get(key)}`];
        seen.set(key, file);
        return [];
      });
    })()
  );

  const duplicateProps = (where, props) => {
    const names = (props ?? []).map((p) => p.name);
    return [...new Set(names.filter((name, i) => names.indexOf(name) !== i))].map((name) => `${where}: prop "${name}" is listed more than once`);
  };
  check(
    'props: each prop is listed once; a required prop has no default',
    files.flatMap(({ file, schema: c }) => {
      const parts = [[c.name, c.props], ...(c.subcomponents ?? []).map((s) => [s.name, s.props]), ...(c.types ?? []).map((t) => [t.name, t.props])];
      return parts.flatMap(([where, props]) => [
        ...duplicateProps(`${file} ${where}`, props),
        ...(props ?? []).filter((p) => p.required && p.defaultValue !== undefined).map((p) => `${file} ${where}.${p.name}: required but has a default`),
      ]);
    })
  );
  check(
    'parts: a subcomponent is named <Component>.<Part>',
    files.flatMap(({ file, schema: c }) =>
      (c.subcomponents ?? []).filter((s) => !s.name.startsWith(`${c.name}.`)).map((s) => `${file}: "${s.name}" does not start with "${c.name}."`)
    )
  );
  check(
    'lifecycle: deprecated components, and only those, are imported from /deprecated',
    files
      .filter(({ schema: c }) => (c.status === 'deprecated') !== String(c.importPath).endsWith('/deprecated'))
      .map(({ file, schema: c }) => `${file}: status ${c.status}, importPath ${c.importPath}`)
  );

  return { report, problems, counts: { components: files.length } };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { report, problems, counts } = validate();
  console.log(report.join('\n'));
  if (problems.length) {
    console.error(`\n${problems.length} problem(s):\n${problems.slice(0, 40).map((p) => `  - ${p}`).join('\n')}`);
    process.exit(1);
  }
  console.log(`\nComponent schemas valid: ${counts.components} components.`);
}
