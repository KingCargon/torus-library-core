/**
 * Instance configuration loading and validation.
 *
 * The engine holds no knowledge of any particular organisation. Everything
 * organisation-specific — ID prefix, document type codes, audience names,
 * which audience (if any) is publishable, paths, PDF branding — arrives
 * through this config. That is what makes the engine reusable by a company
 * that has never heard of Torus.
 */

import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { LibraryError, codes, formatAjvErrors } from './errors.js';

const here = dirname(fileURLToPath(import.meta.url));
const schema = JSON.parse(
  readFileSync(resolve(here, '../schemas/library-config.schema.json'), 'utf8'),
);

const ajv = addFormats(new Ajv({ allErrors: true, strict: false }));
const validate = ajv.compile(schema);

/**
 * @param {object} raw parsed config object
 * @param {string} baseDir directory that relative paths resolve against
 */
export function loadConfigObject(raw, baseDir) {
  if (!validate(raw)) {
    throw new LibraryError(
      codes.CONFIG_INVALID,
      formatAjvErrors(validate.errors, 'Library configuration is invalid'),
      { errors: validate.errors },
    );
  }

  // A configured public_audience that isn't in the audience list would
  // silently create an unreachable publish path. Fail loudly instead.
  if (raw.public_audience && !raw.audiences.includes(raw.public_audience)) {
    throw new LibraryError(
      codes.CONFIG_INVALID,
      `Library configuration is invalid:\n  - public_audience '${raw.public_audience}' is not present in audiences (${raw.audiences.join(', ')})`,
      {},
    );
  }

  const abs = (p) => (isAbsolute(p) ? p : resolve(baseDir, p));

  return {
    ...raw,
    baseDir,
    resolved: {
      papers: abs(raw.paths.papers),
      canon: abs(raw.paths.canon),
      manifest: abs(raw.paths.manifest),
      publicExport: raw.paths.public_export ? abs(raw.paths.public_export) : null,
      references: raw.paths.references ? abs(raw.paths.references) : null,
      exports: raw.paths.exports ? abs(raw.paths.exports) : null,
    },
  };
}

export function loadConfigFile(configPath) {
  let raw;
  try {
    raw = JSON.parse(readFileSync(configPath, 'utf8'));
  } catch (cause) {
    throw new LibraryError(
      codes.CONFIG_INVALID,
      `Could not read library configuration at ${configPath} — ${cause.message}`,
      { configPath },
    );
  }
  return loadConfigObject(raw, dirname(resolve(configPath)));
}
