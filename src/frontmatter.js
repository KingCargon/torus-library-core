/**
 * YAML front-matter parsing and serialisation.
 *
 * Front matter is delimited by `---` fences at the very start of the file.
 * Parsing is deliberately strict: a paper without front matter is a paper
 * whose audience is unknown, and unknown audience must never be guessed.
 */

import yaml from 'js-yaml';
import { LibraryError, codes } from './errors.js';

const FENCE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/**
 * YAML parses an unquoted `2026-08-09` into a Date, not a string — a
 * perfectly natural way to write a date that would otherwise be rejected
 * as the wrong type. Normalise Date values back to `YYYY-MM-DD` so authors
 * may quote them or not, and validation sees one consistent shape.
 */
function normaliseDates(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (Array.isArray(value)) return value.map(normaliseDates);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normaliseDates(v)]));
  }
  return value;
}

/**
 * @param {string} raw full file contents
 * @returns {{ metadata: object, body: string }}
 */
export function parse(raw, sourceLabel = 'document') {
  const match = FENCE.exec(raw);
  if (!match) {
    throw new LibraryError(
      codes.FRONTMATTER_MISSING,
      `${sourceLabel}: no YAML front matter found. Every paper must begin with a '---' fenced metadata block — see templates/PAPER_TEMPLATE.md.`,
      { sourceLabel },
    );
  }

  let metadata;
  try {
    metadata = yaml.load(match[1]);
  } catch (cause) {
    throw new LibraryError(
      codes.FRONTMATTER_MALFORMED,
      `${sourceLabel}: front matter is not valid YAML — ${cause.message}`,
      { sourceLabel, cause: cause.message },
    );
  }

  if (metadata === null || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw new LibraryError(
      codes.FRONTMATTER_MALFORMED,
      `${sourceLabel}: front matter must be a YAML mapping of fields, got ${Array.isArray(metadata) ? 'a list' : typeof metadata}.`,
      { sourceLabel },
    );
  }

  return { metadata: normaliseDates(metadata), body: raw.slice(match[0].length) };
}

/**
 * Rewrite a document's front matter while leaving the body byte-identical.
 * Key order is stable so repeated writes don't churn the file.
 */
export function serialise(metadata, body) {
  const front = yaml.dump(metadata, { lineWidth: -1, noRefs: true, sortKeys: false });
  return `---\n${front}---\n${body}`;
}
