/**
 * @lima-design/component-schemas — the public API of each Lima component, as data.
 *
 *   import { loadComponentSchemas } from '@lima-design/component-schemas';
 *   const button = loadComponentSchemas().find((c) => c.id === 'button');
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

/** Version of this set of component schemas (the package version). */
export const VERSION = readJson(join(PACKAGE_ROOT, 'package.json')).version;

/** The format every component schema file follows. */
export function loadFormat() {
  return readJson(join(PACKAGE_ROOT, 'schema', 'component.schema.json'));
}

/** Identifier of the format, including its version: urn:lima-design:schema:component:<version> */
export const FORMAT_ID = loadFormat().$id;

/** Component schema files as { file, schema }, sorted by file name. */
export function loadComponentSchemaFiles(root = PACKAGE_ROOT) {
  const dir = join(root, 'components');
  return readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({ file, schema: readJson(join(dir, file)) }));
}

/** Every component schema, without the `$schema` pointer. */
export function loadComponentSchemas(root = PACKAGE_ROOT) {
  return loadComponentSchemaFiles(root).map(({ schema: { $schema, ...component } }) => component);
}
