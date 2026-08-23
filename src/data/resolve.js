/**
 * Resolving Data citations against the Library.
 *
 * When a measurement system cites a Library record, this answers: does that
 * record exist, and what is its standing?
 *
 * THE RESOLVER IS READ-ONLY, BY CONSTRUCTION. It imports no writer and
 * touches no file. Canon cannot be mutated by anything arriving from a
 * measurement system, which is the guarantee the Separation Charter makes
 * public: "Data does not replace Library."
 *
 * A superseded or amended record resolves SUCCESSFULLY, with a notice. That
 * is deliberate and worth stating plainly: a measurement taken in March
 * legitimately cites what the company believed in March. Invalidating the
 * citation because the paper was later revised would rewrite history to
 * match the present, which is precisely what a chronicle exists to prevent.
 */

import * as manifestStore from '../manifest.js';
import { LibraryError, codes } from '../errors.js';
import { parseDataRef, validateDataLink } from './contract.js';

/**
 * Resolve a citation of a Library record.
 *
 * @returns {{ok:boolean, library_id:string, status:string|null, notices:string[], problem:string|null, record:object|null}}
 */
export function resolveCitation(libraryId, config) {
  const manifest = manifestStore.load(config);
  const record = manifest.entries[libraryId] ?? null;

  if (!record) {
    return {
      ok: false,
      library_id: libraryId,
      status: null,
      notices: [],
      problem: `no Library record '${libraryId}' exists. The Library is authoritative for its own identifiers; a citation of an unknown record cannot be honoured.`,
      record: null,
    };
  }

  const notices = [];
  if (record.status === 'superseded') {
    notices.push(
      `'${libraryId}' has been superseded by '${record.superseded_by}'. The citation remains valid for the period it describes — the record was in force when cited — but a current reader should also consult the successor.`,
    );
  }
  if (record.status === 'amended') {
    notices.push(
      `'${libraryId}' carries amendments (${(record.amended_by ?? []).join(', ')}). It remains the operative record.`,
    );
  }
  if (record.status !== 'canon' && record.status !== 'superseded' && record.status !== 'amended') {
    return {
      ok: false,
      library_id: libraryId,
      status: record.status,
      notices,
      problem: `'${libraryId}' has status '${record.status}' and is not published. Only published records may be cited as evidence.`,
      record: null,
    };
  }

  return {
    ok: true,
    library_id: libraryId,
    status: record.status,
    notices,
    problem: null,
    // A read-only projection. Deliberately excludes file paths so a
    // measurement system cannot be handed a route into Library storage.
    record: {
      id: record.id,
      title: record.title,
      date: record.date,
      status: record.status,
      audience: record.audience,
      source_sha256: record.source_sha256,
      pdf_sha256: record.pdf_sha256,
      superseded_by: record.superseded_by ?? null,
      amended_by: record.amended_by ?? null,
    },
  };
}

/**
 * Validate a batch of links and resolve each one's Library side.
 *
 * A malformed link is reported, never thrown past the batch — a single bad
 * row in a measurement export should not prevent the rest from resolving.
 */
export function resolveLinks(links, config) {
  const results = [];
  for (const [i, link] of (links ?? []).entries()) {
    const subject = `link #${i + 1}`;
    try {
      validateDataLink(link, subject);
    } catch (error) {
      results.push({ ok: false, link, problem: error.message, code: error.code });
      continue;
    }
    const resolution = resolveCitation(link.library_id, config);
    results.push({
      ok: resolution.ok,
      link,
      data_ref: parseDataRef(link.data_ref),
      resolution,
      problem: resolution.problem,
      code: resolution.ok ? null : codes.DATA_CITATION_UNRESOLVED,
    });
  }
  return {
    ok: results.every((r) => r.ok),
    checked: results.length,
    resolved: results.filter((r) => r.ok).length,
    results,
  };
}

/**
 * Enforce that an audience boundary cannot be crossed by a link.
 *
 * A measurement system might legitimately hold a reference to an internal
 * or restricted Library record. That does not entitle a *consumer* of the
 * link to the record. This gate answers: may this audience be told that
 * this record exists, and see its metadata?
 */
export function assertLinkVisibleTo(resolution, audience, config) {
  if (!config.audiences.includes(audience)) {
    throw new LibraryError(
      codes.AUDIENCE_UNKNOWN,
      `Cannot evaluate link visibility for unknown audience '${audience}'. Configured: ${config.audiences.join(', ')}.`,
      { audience },
    );
  }
  if (!resolution.ok || !resolution.record) return false;
  // Exactly the export rule: no inheritance, no widening on missing data.
  return resolution.record.audience === audience;
}
