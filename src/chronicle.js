/**
 * Chronicle entries — one dated record per canonical repository.
 *
 * Entries are GENERATED from the portfolio index, never hand-written
 * (ADR-0007). Two reasons:
 *
 *   - A hand-maintained chronicle of 21 repositories decays within days,
 *     and a chronicle that silently disagrees with reality is worse than
 *     none.
 *   - Generation makes drift a bug rather than a chore: regenerate, and
 *     any difference is real.
 *
 * A generated entry is a normal paper. It carries the same front matter,
 * validates against the same schema, and publishes through the same
 * pipeline as a hand-written one — so canon freeze, hashing, audience
 * enforcement, and supersession all apply unchanged.
 *
 * What an entry deliberately does NOT contain: any claim about a
 * capability layer, intended architecture, or a system taxonomy. Per
 * ADR-0007 the Chronicle records what exists. That limitation is stated
 * in the generated text itself so a reader does not mistake silence for
 * an absence of intent.
 */

import { serialise } from './frontmatter.js';
import { formatReference } from './reference.js';
import { LibraryError, codes } from './errors.js';

/** Sequence numbers are assigned per (date, type) — see the ID scheme. */
function assignId(config, date, type, sequence) {
  return `${config.id_prefix}-${date}-${type}-${String(sequence).padStart(3, '0')}`;
}

function describeLocal(repo) {
  if (!repo.local) {
    return `This repository has **no local clone** in the inspected working root. It exists on the remote only.`;
  }
  const bits = [
    `Local checkout is on \`${repo.local.branch ?? 'an unnamed branch'}\``,
    repo.local.head ? ` at \`${repo.local.head}\`` : '',
    repo.local.clean === true ? ', with a clean working tree' : '',
    repo.local.clean === false ? ', with uncommitted changes present at the time of indexing' : '',
    '.',
  ];
  return bits.join('');
}

function describeWorktrees(repo) {
  const wt = repo.local?.worktrees ?? [];
  if (wt.length === 0) return null;
  const many = wt.length > 1;
  return (
    `It has **${wt.length} worktree${many ? 's' : ''}** — ` +
    wt.map((w) => `\`${w}\``).join(', ') +
    `. ${many ? 'These are execution surfaces' : 'That is an execution surface'} of this repository, ` +
    `not ${many ? 'separate products' : 'a separate product'}, and ${many ? 'are' : 'is'} recorded here so that ` +
    `${many ? 'they are' : 'it is'} never indexed as such.`
  );
}

/**
 * Generate the Markdown body of one chronicle entry.
 * Kept separate from the front matter so the prose can be reviewed alone.
 */
export function renderEntryBody(repo, { generatedAt }) {
  const ref = formatReference({ owner: repo.owner, repo: repo.name });
  const lines = [];

  lines.push('## What this is');
  lines.push('');
  lines.push(
    repo.description
      ? `${repo.description}`
      : `No description is recorded on the repository itself. This entry records its existence and state; what it is *for* belongs in a paper written by someone who knows.`,
  );
  lines.push('');

  lines.push('## Identity');
  lines.push('');
  lines.push('| | |');
  lines.push('| --- | --- |');
  lines.push(`| Canonical reference | \`${ref}\` |`);
  lines.push(`| Visibility | ${repo.visibility} |`);
  lines.push(`| Version | ${repo.local?.version ? `\`${repo.local.version}\`` : '— none declared'} |`);
  lines.push(`| Local path | ${repo.local ? `\`${repo.local.path}\`` : '_not cloned locally_'} |`);
  lines.push('');

  lines.push('## State at the time of this entry');
  lines.push('');
  lines.push(describeLocal(repo));
  const wt = describeWorktrees(repo);
  if (wt) { lines.push(''); lines.push(wt); }
  lines.push('');

  if (repo.builds.length > 0) {
    lines.push('## Builds');
    lines.push('');
    lines.push('Branches following the numbered-build convention:');
    lines.push('');
    for (const b of repo.builds) {
      lines.push(`- \`${b}\` — \`${formatReference({ owner: repo.owner, repo: repo.name, kind: 'branch', target: b })}\``);
    }
    lines.push('');
  }

  if (repo.releases.length > 0) {
    lines.push('## Releases');
    lines.push('');
    lines.push(repo.releases.map((r) => `\`${r}\``).join(' · '));
    lines.push('');
  }

  lines.push('## Scope of this entry');
  lines.push('');
  lines.push(
    'This is a **repository-first** chronicle entry (`ADR-0007`). It records what ' +
      'demonstrably existed at the moment of generation: a repository, its visibility, ' +
      'its declared version, its branches, builds, releases, and worktrees.',
  );
  lines.push('');
  lines.push(
    'It deliberately makes **no claim** about intended architecture, product ' +
      'taxonomy, or where this repository sits in any system map. That silence is a ' +
      'decision, not an omission: canon is frozen, and the capability layer is not yet ' +
      'settled enough to freeze. A later paper may add that layer without superseding ' +
      'this entry.',
  );
  lines.push('');
  lines.push(`_Generated from the portfolio index at ${generatedAt}. Regenerate to refresh; do not hand-edit._`);
  lines.push('');

  return lines.join('\n');
}

/**
 * Generate chronicle entry documents for every repository in an index.
 *
 * @param {object} index          from buildIndex()
 * @param {object} config         instance config
 * @param {object} [options]
 * @param {string} [options.date] publication date (YYYY-MM-DD)
 * @param {string} [options.audience] audience for generated entries
 * @param {string[]} [options.authors]
 * @param {number} [options.startSequence]
 * @returns {Array<{id:string, filename:string, contents:string, repository:string}>}
 */
export function generateEntries(index, config, options = {}) {
  const {
    date = new Date().toISOString().slice(0, 10),
    audience = 'internal',
    authors = ['Torus Library Chronicle'],
    startSequence = 1,
    type = 'CHR',
  } = options;

  if (!Object.hasOwn(config.type_codes ?? {}, type)) {
    throw new LibraryError(
      codes.ID_TYPE_UNKNOWN,
      `Chronicle entries use type code '${type}', which is not configured for this library. Add it to type_codes, or pass a configured code.`,
      { type },
    );
  }
  if (!config.audiences.includes(audience)) {
    throw new LibraryError(
      codes.AUDIENCE_UNKNOWN,
      `Chronicle entries were asked to use audience '${audience}', which this library does not recognise. Configured: ${config.audiences.join(', ')}.`,
      { audience },
    );
  }

  const repos = Object.values(index.repositories).sort((a, b) => (a.id < b.id ? -1 : 1));

  return repos.map((repo, i) => {
    const id = assignId(config, date, type, startSequence + i);
    const metadata = {
      id,
      title: `Chronicle — ${repo.id}`,
      date,
      authors,
      approvers: [],
      status: 'draft',
      audience,
      supersedes: null,
      amends: null,
      markdown_source: null,
      pdf: null,
      pdf_hash: null,
      source_sha256: null,
      frozen_at: null,
      related_products: [repo.name],
      related_builds: repo.builds,
      related_data_ids: [],
      licence_or_confidentiality: null,
    };

    return {
      id,
      repository: repo.id,
      filename: `${id}.md`,
      contents: serialise(metadata, `\n${renderEntryBody(repo, { generatedAt: index.generated_at })}`),
    };
  });
}
