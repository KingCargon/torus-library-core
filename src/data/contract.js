/**
 * The Library ↔ Data contract.
 *
 * Bound by frozen canon (`TL-2026-08-18-DEF-001`, the Library/Data
 * Separation Charter), which is public and cannot be silently revised.
 * Three of its consequences are load-bearing here:
 *
 *   1. "A Library paper may reference Data identifiers; the reference is
 *      one-directional and optional."
 *   2. "A paper remains complete and meaningful with no Data attached.
 *      Nothing in the Library is blocked on Data existing."
 *   3. "Data may be rebuilt, re-derived, or re-instrumented without
 *      invalidating any paper."
 *
 * Consequence (2) is the composability requirement in practice: nothing in
 * this module may be imported by the publishing pipeline, and the Library
 * must work identically when no measurement system exists at all — which,
 * at the time of writing, is the actual state of the world.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 *
 * It does not define what a measurement identifier looks like. A reference
 * is `<source>:<identifier>` and the identifier is opaque. Defining its
 * grammar would mean the Library inventing the internal design of a product
 * it does not own — and `ADR-0007` forbids canonizing that product's
 * existence on the strength of a name.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { LibraryError, codes, formatAjvErrors } from '../errors.js';

const here = dirname(fileURLToPath(import.meta.url));
const schema = JSON.parse(readFileSync(resolve(here, '../../schemas/data-link.schema.json'), 'utf8'));

const ajv = addFormats(new Ajv({ allErrors: true, strict: false }));
const validateShape = ajv.compile(schema);

/** The contract version this build implements. */
export const CONTRACT_VERSION = '1.0';

const REF = /^([a-z][a-z0-9_-]{1,31}):(.+)$/;

/** Split a namespaced reference. The identifier is returned untouched. */
export function parseDataRef(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new LibraryError(
      codes.DATA_REF_MALFORMED,
      `A data reference must be a non-empty string of the form '<source>:<identifier>'.`,
      { raw },
    );
  }
  const m = REF.exec(raw.trim());
  if (!m) {
    throw new LibraryError(
      codes.DATA_REF_MALFORMED,
      `Data reference '${raw}' is malformed. Expected '<source>:<identifier>' — for example 'metrics:revenue/2026-Q3'. ` +
        `The source names the measurement system; the identifier belongs to that system and is not interpreted here.`,
      { raw },
    );
  }
  return { source: m[1], identifier: m[2], raw: raw.trim() };
}

/**
 * Compare a link's declared contract version against this implementation.
 * An unknown MAJOR is refused; an unknown MINOR is accepted, because a
 * later minor version may only add optional fields.
 */
export function checkContractVersion(declared) {
  const [major, minor] = String(declared).split('.').map(Number);
  const [ourMajor, ourMinor] = CONTRACT_VERSION.split('.').map(Number);

  if (!Number.isInteger(major) || !Number.isInteger(minor)) {
    throw new LibraryError(
      codes.DATA_CONTRACT_VERSION,
      `Data link declares contract_version '${declared}', which is not MAJOR.MINOR.`,
      { declared },
    );
  }
  if (major !== ourMajor) {
    throw new LibraryError(
      codes.DATA_CONTRACT_VERSION,
      `Data link declares contract version ${declared}, but this Library implements ${CONTRACT_VERSION}. ` +
        `A different major version may change meaning, so it is refused rather than guessed at.`,
      { declared, implemented: CONTRACT_VERSION },
    );
  }
  return { compatible: true, forwardMinor: minor > ourMinor };
}

/**
 * Validate a link's structure. This is pure: it does not consult the
 * manifest and does not require any measurement system to exist.
 */
export function validateDataLink(link, subject = 'data link') {
  if (!validateShape(link)) {
    throw new LibraryError(
      codes.DATA_LINK_INVALID,
      formatAjvErrors(validateShape.errors, `${subject}: invalid`),
      { errors: validateShape.errors },
    );
  }
  checkContractVersion(link.contract_version);
  parseDataRef(link.data_ref);

  if (link.period_start && link.period_end && link.period_start > link.period_end) {
    throw new LibraryError(
      codes.DATA_LINK_INVALID,
      `${subject}: period_start (${link.period_start}) is after period_end (${link.period_end}).`,
      {},
    );
  }
  return link;
}
