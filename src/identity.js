/**
 * Document ID rules — PREFIX-YYYY-MM-DD-TYPE-###
 *
 * The *shape* is fixed by Build 01 (TORUS_LIBRARY_ARCHITECTURE.md §3) and is
 * not configurable. The prefix and the set of valid type codes are instance
 * configuration, which is what lets a non-Torus company use this engine
 * (ADR-0002).
 */

import { LibraryError, codes } from './errors.js';

const ID_SHAPE = /^([A-Z][A-Z0-9]{1,7})-(\d{4})-(\d{2})-(\d{2})-([A-Z]{3})-(\d{3})$/;

export function parseId(id) {
  if (typeof id !== 'string') {
    throw new LibraryError(codes.ID_MALFORMED, `Document ID must be a string, got ${typeof id}.`);
  }
  const m = ID_SHAPE.exec(id);
  if (!m) {
    throw new LibraryError(
      codes.ID_MALFORMED,
      `Document ID '${id}' is malformed. Expected PREFIX-YYYY-MM-DD-TYPE-### (for example TL-2026-08-07-PHI-001).`,
      { id },
    );
  }
  const [, prefix, year, month, day, type, sequence] = m;
  return { prefix, date: `${year}-${month}-${day}`, type, sequence, id };
}

/**
 * Validate an ID against the instance's configured prefix and type codes,
 * and confirm the ID's embedded date matches the paper's declared date.
 */
export function validateId(id, config, declaredDate) {
  const parsed = parseId(id);

  if (parsed.prefix !== config.id_prefix) {
    throw new LibraryError(
      codes.ID_PREFIX_MISMATCH,
      `Document ID '${id}' uses prefix '${parsed.prefix}', but this library is configured for '${config.id_prefix}'.`,
      { id, expected: config.id_prefix, found: parsed.prefix },
    );
  }

  if (!Object.hasOwn(config.type_codes, parsed.type)) {
    const known = Object.keys(config.type_codes).sort().join(', ');
    throw new LibraryError(
      codes.ID_TYPE_UNKNOWN,
      `Document ID '${id}' uses type code '${parsed.type}', which is not configured for this library. Known type codes: ${known}.`,
      { id, found: parsed.type },
    );
  }

  if (declaredDate && parsed.date !== declaredDate) {
    throw new LibraryError(
      codes.ID_DATE_MISMATCH,
      `Document ID '${id}' encodes date ${parsed.date}, but the paper declares date ${declaredDate}. The ID's date is the publication date and must match.`,
      { id, idDate: parsed.date, declaredDate },
    );
  }

  return parsed;
}
