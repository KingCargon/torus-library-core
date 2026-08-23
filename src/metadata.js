/**
 * Paper metadata validation: JSON Schema shape first, then the semantic
 * rules that a schema cannot express (ID/prefix/type/date agreement,
 * audience recognition, self-reference).
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { LibraryError, codes, formatAjvErrors } from './errors.js';
import { validateId } from './identity.js';
import { validateAudience } from './audience.js';

const here = dirname(fileURLToPath(import.meta.url));
const schema = JSON.parse(
  readFileSync(resolve(here, '../schemas/paper-metadata.schema.json'), 'utf8'),
);

const ajv = addFormats(new Ajv({ allErrors: true, strict: false }));
const validateShape = ajv.compile(schema);

export function validateMetadata(metadata, config, subject = 'document') {
  if (!validateShape(metadata)) {
    throw new LibraryError(
      codes.METADATA_INVALID,
      formatAjvErrors(validateShape.errors, `${subject}: metadata is invalid`),
      { subject, errors: validateShape.errors },
    );
  }

  validateId(metadata.id, config, metadata.date);
  validateAudience(metadata, config, subject);

  for (const field of ['supersedes', 'amends']) {
    if (metadata[field] && metadata[field] === metadata.id) {
      throw new LibraryError(
        codes.SELF_REFERENCE,
        `${subject}: '${field}' points at the paper's own ID (${metadata.id}). A paper cannot ${field === 'supersedes' ? 'supersede' : 'amend'} itself.`,
        { subject, field },
      );
    }
  }

  return metadata;
}
