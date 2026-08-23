/**
 * Cross-repository references.
 *
 * A Library paper needs to point at things living outside the Library —
 * a repository, a build, a branch, a commit, a release — without copying
 * them (product repositories keep their own working truth) and without
 * inventing a URL scheme tied to one git host.
 *
 * Grammar:
 *
 *   repo:<owner>/<name>
 *   repo:<owner>/<name>@<commit>
 *   repo:<owner>/<name>#build/<id>
 *   repo:<owner>/<name>#branch/<name>
 *   repo:<owner>/<name>#release/<version>
 *
 * Design notes:
 *
 * - The reference names a *canonical repository*, never a filesystem path
 *   or a worktree. Paths move between machines; worktrees are execution
 *   surfaces (ADR-0007).
 * - Host is deliberately absent. `owner/name` is the identity; where it is
 *   hosted is instance configuration, so a reference stays valid if the
 *   portfolio migrates hosts.
 * - A commit is recorded as written. Chronicle records short hashes as
 *   they appear in git output; both short and full are accepted.
 */

import { LibraryError, codes } from './errors.js';

const REF = /^repo:([A-Za-z0-9][\w.-]*)\/([A-Za-z0-9][\w.\- ]*?)(?:@([0-9a-f]{7,40})|#(build|branch|release)\/(.+))?$/;

/**
 * @param {string} raw
 * @returns {{kind:'repository'|'commit'|'build'|'branch'|'release', owner:string, repo:string, target:string|null, raw:string}}
 */
export function parseReference(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new LibraryError(
      codes.REFERENCE_MALFORMED,
      `A cross-repository reference must be a non-empty string, got ${typeof raw}.`,
      { raw },
    );
  }

  const m = REF.exec(raw.trim());
  if (!m) {
    throw new LibraryError(
      codes.REFERENCE_MALFORMED,
      `Reference '${raw}' is malformed. Expected one of:\n` +
        `  repo:<owner>/<name>\n` +
        `  repo:<owner>/<name>@<commit>\n` +
        `  repo:<owner>/<name>#build/<id>\n` +
        `  repo:<owner>/<name>#branch/<name>\n` +
        `  repo:<owner>/<name>#release/<version>`,
      { raw },
    );
  }

  const [, owner, repo, commit, qualifier, target] = m;

  if (commit) return { kind: 'commit', owner, repo, target: commit, raw };
  if (qualifier) {
    if (target.trim() === '') {
      throw new LibraryError(
        codes.REFERENCE_MALFORMED,
        `Reference '${raw}' declares '${qualifier}/' with nothing after it.`,
        { raw },
      );
    }
    return { kind: qualifier, owner, repo, target: target.trim(), raw };
  }
  return { kind: 'repository', owner, repo, target: null, raw };
}

/** Build a reference string from parts. Inverse of parseReference. */
export function formatReference({ owner, repo, kind = 'repository', target = null }) {
  const base = `repo:${owner}/${repo}`;
  if (kind === 'repository') return base;
  if (kind === 'commit') return `${base}@${target}`;
  return `${base}#${kind}/${target}`;
}

/**
 * Check a reference against a portfolio index: does the repository it
 * names actually exist? An unresolvable reference is how a chronicle
 * quietly starts lying, so this is a first-class check rather than a
 * lint.
 *
 * @returns {{ok:boolean, reference:object, problem:string|null}}
 */
export function resolveReference(raw, index) {
  const reference = parseReference(raw);
  const key = `${reference.owner}/${reference.repo}`;
  // Matched case-insensitively for the same reason the index is keyed that
  // way: a human writing a reference by hand will not reproduce the host's
  // exact casing, and a git host does not require them to.
  const repositories = index?.repositories ?? {};
  const match = Object.keys(repositories).find((k) => k.toLowerCase() === key.toLowerCase());
  const entry = match ? repositories[match] : null;

  if (!entry) {
    return {
      ok: false,
      reference,
      problem: `no repository '${key}' in the portfolio index`,
    };
  }

  if (reference.kind === 'branch' && Array.isArray(entry.branches)) {
    if (!entry.branches.includes(reference.target)) {
      return {
        ok: false,
        reference,
        problem: `repository '${key}' has no branch '${reference.target}'`,
      };
    }
  }

  return { ok: true, reference, problem: null };
}

/** Extract every reference-shaped token from a body of prose. */
export function extractReferences(text) {
  if (typeof text !== 'string') return [];
  const found = text.match(/repo:[A-Za-z0-9][\w.-]*\/[A-Za-z0-9][\w.-]*(?:@[0-9a-f]{7,40}|#(?:build|branch|release)\/[^\s`)\]]+)?/g);
  if (!found) return [];
  // A reference at the end of a sentence picks up the full stop; trailing
  // sentence punctuation is never part of a git ref.
  return [...new Set(found.map((r) => r.replace(/[.,;:!?]+$/, '')))];
}
