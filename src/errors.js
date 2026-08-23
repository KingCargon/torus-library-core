/**
 * Failure taxonomy for the Library engine.
 *
 * Every error carries a stable `code` so callers (and tests) can branch on
 * the failure kind rather than on message text, and a message written for
 * the person who has to fix it — what happened, where, and what to do.
 */

export class LibraryError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'LibraryError';
    this.code = code;
    this.details = details;
  }
}

export const codes = {
  CONFIG_INVALID: 'CONFIG_INVALID',
  FRONTMATTER_MISSING: 'FRONTMATTER_MISSING',
  FRONTMATTER_MALFORMED: 'FRONTMATTER_MALFORMED',
  METADATA_INVALID: 'METADATA_INVALID',
  ID_MALFORMED: 'ID_MALFORMED',
  ID_PREFIX_MISMATCH: 'ID_PREFIX_MISMATCH',
  ID_TYPE_UNKNOWN: 'ID_TYPE_UNKNOWN',
  ID_DATE_MISMATCH: 'ID_DATE_MISMATCH',
  AUDIENCE_UNKNOWN: 'AUDIENCE_UNKNOWN',
  AUDIENCE_NOT_PUBLIC: 'AUDIENCE_NOT_PUBLIC',
  NO_PUBLIC_AUDIENCE_CONFIGURED: 'NO_PUBLIC_AUDIENCE_CONFIGURED',
  NOT_APPROVED: 'NOT_APPROVED',
  CANON_FROZEN: 'CANON_FROZEN',
  CANON_MISSING: 'CANON_MISSING',
  SUPERSEDE_TARGET_MISSING: 'SUPERSEDE_TARGET_MISSING',
  SUPERSEDE_TARGET_NOT_CANON: 'SUPERSEDE_TARGET_NOT_CANON',
  AMEND_TARGET_MISSING: 'AMEND_TARGET_MISSING',
  AMEND_TARGET_NOT_CANON: 'AMEND_TARGET_NOT_CANON',
  SELF_REFERENCE: 'SELF_REFERENCE',
  INTEGRITY_SOURCE_MISMATCH: 'INTEGRITY_SOURCE_MISMATCH',
  INTEGRITY_PDF_MISMATCH: 'INTEGRITY_PDF_MISMATCH',
  INTEGRITY_FILE_MISSING: 'INTEGRITY_FILE_MISSING',
  DATA_REF_MALFORMED: 'DATA_REF_MALFORMED',
  DATA_LINK_INVALID: 'DATA_LINK_INVALID',
  DATA_CONTRACT_VERSION: 'DATA_CONTRACT_VERSION',
  DATA_CITATION_UNRESOLVED: 'DATA_CITATION_UNRESOLVED',
  DATA_ADAPTER_INVALID: 'DATA_ADAPTER_INVALID',
  PROHIBITED_SECRET: 'PROHIBITED_SECRET',
  REFERENCE_INVALID: 'REFERENCE_INVALID',
  EXPORT_FAILED: 'EXPORT_FAILED',
  REFERENCE_MALFORMED: 'REFERENCE_MALFORMED',
  REFERENCE_UNRESOLVED: 'REFERENCE_UNRESOLVED',
  PORTFOLIO_RECORD_INVALID: 'PORTFOLIO_RECORD_INVALID',
  PORTFOLIO_DUPLICATE_IDENTITY: 'PORTFOLIO_DUPLICATE_IDENTITY',
  RENDERER_NOT_FOUND: 'RENDERER_NOT_FOUND',
  RENDERER_FAILED: 'RENDERER_FAILED',
};

/** Format Ajv errors into something a human can act on. */
export function formatAjvErrors(errors, subject) {
  if (!errors || errors.length === 0) return `${subject}: unknown validation failure`;
  const lines = errors.map((e) => {
    const where = e.instancePath ? e.instancePath.replace(/^\//, '') : '(root)';
    if (e.keyword === 'required') {
      return `  - missing required field: ${e.params.missingProperty}`;
    }
    if (e.keyword === 'additionalProperties') {
      return `  - unrecognised field: ${e.params.additionalProperty}`;
    }
    if (e.keyword === 'enum') {
      return `  - ${where}: ${e.message} (${e.params.allowedValues.join(', ')})`;
    }
    return `  - ${where}: ${e.message}`;
  });
  return `${subject}:\n${lines.join('\n')}`;
}
