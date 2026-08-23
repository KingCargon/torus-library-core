/**
 * The portfolio index — what repositories exist, and what state they are in.
 *
 * Two rules decided in ADR-0007 shape this module:
 *
 *   1. REMOTE-FIRST. The portfolio is enumerated from the git host, then
 *      local clones are matched onto it. Walking the filesystem instead
 *      would both over-count (worktrees look like repositories) and
 *      under-count (repositories with no local clone vanish). The 2026-08-17
 *      audit found both failures happening simultaneously.
 *
 *   2. CANONICAL IDENTITY IS THE REMOTE. `owner/name`, never a path. A
 *      worktree is an execution surface and is folded into its parent.
 *
 * The engine holds no knowledge of any particular git host or portfolio.
 * Collection is done by a *source adapter* passed in by the caller — the
 * same pattern the PDF renderer uses (ADR-0004) — so this module is pure:
 * it takes records, validates and normalises them, and produces an index.
 */

import { LibraryError, codes } from './errors.js';

/** Shape one raw record into an index entry, rejecting anything unusable. */
function normaliseRecord(record, i) {
  const where = record?.name ? `repository '${record.name}'` : `repository #${i + 1}`;

  for (const field of ['owner', 'name']) {
    if (typeof record?.[field] !== 'string' || record[field].trim() === '') {
      throw new LibraryError(
        codes.PORTFOLIO_RECORD_INVALID,
        `${where}: missing required field '${field}'. A repository cannot be indexed without a canonical owner/name identity.`,
        { record },
      );
    }
  }

  return {
    owner: record.owner,
    name: record.name,
    id: `${record.owner}/${record.name}`,
    // Git hosts treat owner/name case-insensitively, and a local remote
    // URL may be cased differently from the host's own record. Matching on
    // the literal string would split one repository into two — the exact
    // double-count this index exists to prevent.
    key: `${record.owner}/${record.name}`.toLowerCase(),
    visibility: record.visibility ?? 'unknown',
    description: record.description ?? null,
    // Local presence is optional: a repository that exists only on the
    // remote is still a real repository and must still be indexed.
    local: record.local
      ? {
          path: record.local.path,
          branch: record.local.branch ?? null,
          head: record.local.head ?? null,
          version: record.local.version ?? null,
          clean: record.local.clean ?? null,
          worktrees: [...(record.local.worktrees ?? [])].sort(),
        }
      : null,
    branches: [...(record.branches ?? [])].sort(),
    builds: [...(record.builds ?? [])].sort(),
    releases: [...(record.releases ?? [])].sort(),
    updatedAt: record.updatedAt ?? null,
  };
}

/**
 * Build an index from source records.
 *
 * @param {Array<object>} records from a source adapter
 * @param {object} [options]
 * @param {string} [options.generatedAt] ISO timestamp; injectable so tests
 *   and repeated runs can be deterministic.
 */
export function buildIndex(records, { generatedAt = new Date().toISOString() } = {}) {
  if (!Array.isArray(records)) {
    throw new LibraryError(
      codes.PORTFOLIO_RECORD_INVALID,
      `Portfolio records must be an array, got ${typeof records}.`,
      {},
    );
  }

  const repositories = {};
  const duplicates = [];

  const seen = new Map(); // key -> canonical id actually used

  for (const [i, raw] of records.entries()) {
    const entry = normaliseRecord(raw, i);
    if (seen.has(entry.key)) {
      // Two records claiming one canonical identity means the source
      // adapter counted a worktree as a repository — exactly the failure
      // this index exists to prevent. Refuse rather than silently pick one.
      duplicates.push(seen.get(entry.key));
      continue;
    }
    seen.set(entry.key, entry.id);
    repositories[entry.id] = entry;
  }

  if (duplicates.length > 0) {
    throw new LibraryError(
      codes.PORTFOLIO_DUPLICATE_IDENTITY,
      `Two or more records claim the same canonical identity: ${[...new Set(duplicates)].join(', ')}. ` +
        `Canonical identity is the git remote; a worktree must be folded into its parent, never indexed separately.`,
      { duplicates },
    );
  }

  const all = Object.values(repositories);
  return {
    schema_version: 1,
    generated_at: generatedAt,
    counts: {
      repositories: all.length,
      cloned_locally: all.filter((r) => r.local).length,
      remote_only: all.filter((r) => !r.local).length,
      worktrees: all.reduce((n, r) => n + (r.local?.worktrees.length ?? 0), 0),
      public: all.filter((r) => r.visibility?.toLowerCase() === 'public').length,
      private: all.filter((r) => r.visibility?.toLowerCase() === 'private').length,
    },
    repositories,
  };
}

/** Stable ordering for rendering: by identity. */
export function sortedRepositories(index) {
  return Object.values(index.repositories).sort((a, b) => (a.id < b.id ? -1 : 1));
}

/**
 * Human-readable rendering of the index. Generated — never hand-edited,
 * for the same reason the manifest is generated.
 */
export function renderIndexMarkdown(index, config = {}) {
  const org = config.organisation?.name ?? 'Portfolio';
  const rows = sortedRepositories(index)
    .map((r) => {
      const local = r.local
        ? `\`${r.local.branch ?? '?'}\`${r.local.head ? ` @ \`${r.local.head}\`` : ''}`
        : '_not cloned locally_';
      const wt = r.local?.worktrees.length ? ` (+${r.local.worktrees.length} worktree${r.local.worktrees.length > 1 ? 's' : ''})` : '';
      return `| \`${r.id}\` | ${r.visibility} | ${r.local?.version ?? '—'} | ${local}${wt} |`;
    })
    .join('\n');

  return `# ${org} — Portfolio Index

Generated by the Torus Library engine. **Do not hand-edit.**

Canonical identity is the git remote (\`owner/name\`). A worktree is an
execution surface of its repository and is never listed as a separate
repository — see \`ADR-0007\`.

**Generated:** ${index.generated_at}

| Metric | Count |
| --- | --- |
| Canonical repositories | **${index.counts.repositories}** |
| Cloned locally | ${index.counts.cloned_locally} |
| Remote only (no local clone) | ${index.counts.remote_only} |
| Worktrees folded into parents | ${index.counts.worktrees} |
| Public / Private | ${index.counts.public} / ${index.counts.private} |

| Repository | Visibility | Version | Local state |
| --- | --- | --- | --- |
${rows}
`;
}
