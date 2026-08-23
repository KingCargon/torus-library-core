/**
 * Portfolio index construction, and chronicle entry generation.
 *
 * The load-bearing property under test: a worktree must never become a
 * repository. That is the failure the 2026-08-17 audit found and ADR-0007
 * forbids.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIndex, renderIndexMarkdown, generateEntries, codes } from '../src/index.js';
import { identityFromRemote, isWorktree } from '../src/sources/git-portfolio.js';
import * as frontmatter from '../src/frontmatter.js';
import { validateMetadata } from '../src/index.js';
import { makeInstance } from './helpers.js';

const AT = '2026-08-17T12:00:00.000Z';

function expectCode(fn, code) {
  try { fn(); } catch (e) {
    assert.equal(e.code, code, `expected ${code}, got ${e.code}: ${e.message}`);
    return e;
  }
  assert.fail(`expected failure with code ${code}`);
}

const sample = () => [
  {
    owner: 'Acme', name: 'alpha', visibility: 'private', description: 'First thing',
    branches: ['main', 'build/01-foundation'], builds: ['build/01-foundation'],
    releases: ['v0.1.0'],
    local: { path: 'alpha', branch: 'main', head: 'abc1234', version: '0.1.0', clean: true, worktrees: ['alpha-foundation'] },
  },
  { owner: 'Acme', name: 'beta', visibility: 'public' }, // remote only, no local clone
];

test('builds an index keyed by canonical identity', () => {
  const index = buildIndex(sample(), { generatedAt: AT });
  assert.equal(index.counts.repositories, 2);
  assert.equal(index.counts.cloned_locally, 1);
  assert.equal(index.counts.remote_only, 1);
  assert.equal(index.counts.worktrees, 1);
  assert.equal(index.counts.public, 1);
  assert.equal(index.counts.private, 1);
  assert.ok(index.repositories['Acme/alpha']);
});

test('a repository with no local clone is still indexed', () => {
  const index = buildIndex(sample(), { generatedAt: AT });
  assert.equal(index.repositories['Acme/beta'].local, null);
  // The audit found six such repositories being missed entirely.
  assert.equal(index.counts.remote_only, 1);
});

test('refuses two records claiming one canonical identity', () => {
  const dup = [...sample(), { owner: 'Acme', name: 'alpha' }];
  const err = expectCode(() => buildIndex(dup, { generatedAt: AT }), codes.PORTFOLIO_DUPLICATE_IDENTITY);
  assert.match(err.message, /Acme\/alpha/);
  assert.match(err.message, /worktree must be folded into its parent/);
});

test('treats owner/name case-insensitively — one repository, not two', () => {
  // Found against a real portfolio: a local remote URL was cased
  // differently from the host's own record, so one repository was indexed
  // twice — once as "remote only" and once with unknown visibility.
  // Git hosts are case-insensitive here; the index must be too.
  const records = [
    { owner: 'Northwind', name: 'ledger', visibility: 'private' },
    { owner: 'northwind', name: 'ledger', local: { path: 'ledger' } },
  ];
  const err = expectCode(() => buildIndex(records, { generatedAt: AT }), codes.PORTFOLIO_DUPLICATE_IDENTITY);
  assert.match(err.message, /Northwind\/ledger/);
});

test('rejects a record with no canonical identity', () => {
  expectCode(() => buildIndex([{ owner: 'Acme' }], { generatedAt: AT }), codes.PORTFOLIO_RECORD_INVALID);
  expectCode(() => buildIndex([{ name: 'alpha' }], { generatedAt: AT }), codes.PORTFOLIO_RECORD_INVALID);
});

test('rejects a non-array of records', () => {
  expectCode(() => buildIndex(null), codes.PORTFOLIO_RECORD_INVALID);
});

test('index rendering is deterministic and states the worktree rule', () => {
  const index = buildIndex(sample(), { generatedAt: AT });
  const a = renderIndexMarkdown(index, { organisation: { name: 'Acme' } });
  const b = renderIndexMarkdown(index, { organisation: { name: 'Acme' } });
  assert.equal(a, b);
  assert.match(a, /worktree is an\s+execution surface/);
  assert.match(a, /Acme\/alpha/);
});

test('identity is parsed from every remote URL form', () => {
  for (const url of [
    'https://github.com/Northwind/ledger.git',
    'https://github.com/Northwind/ledger',
    'git@github.com:Northwind/ledger.git',
  ]) {
    assert.deepEqual(identityFromRemote(url), { owner: 'Northwind', name: 'ledger' });
  }
  assert.equal(identityFromRemote(null), null);
});

test('isWorktree is false for a directory that is not a repository', () => {
  assert.equal(isWorktree('/tmp'), false);
});

// ---- chronicle generation ------------------------------------------------

test('generates one entry per repository, as drafts', () => {
  const { config, cleanup } = makeInstance({ type_codes: { CHR: 'Chronicle', PHI: 'Philosophy' } });
  const index = buildIndex(sample(), { generatedAt: AT });
  const entries = generateEntries(index, config, { date: '2026-08-17' });

  assert.equal(entries.length, 2);
  // Sorted by identity, so IDs are stable across runs.
  assert.equal(entries[0].repository, 'Acme/alpha');
  assert.equal(entries[0].id, 'NW-2026-08-17-CHR-001');
  assert.equal(entries[1].id, 'NW-2026-08-17-CHR-002');

  for (const e of entries) {
    const { metadata } = frontmatter.parse(e.contents, e.filename);
    assert.equal(metadata.status, 'draft', 'generation must never produce canon');
  }
  cleanup();
});

test('generated entries satisfy the real paper schema', () => {
  const { config, cleanup } = makeInstance({ type_codes: { CHR: 'Chronicle' } });
  const index = buildIndex(sample(), { generatedAt: AT });
  for (const e of generateEntries(index, config, { date: '2026-08-17' })) {
    const { metadata } = frontmatter.parse(e.contents, e.filename);
    assert.doesNotThrow(() => validateMetadata(metadata, config, e.filename));
  }
  cleanup();
});

test('entries record worktrees as execution surfaces, not products', () => {
  const { config, cleanup } = makeInstance({ type_codes: { CHR: 'Chronicle' } });
  const index = buildIndex(sample(), { generatedAt: AT });
  const alpha = generateEntries(index, config, { date: '2026-08-17' })[0];
  assert.match(alpha.contents, /alpha-foundation/);
  assert.match(alpha.contents, /not a separate product|not separate products/);
  cleanup();
});

test('entries state the repository-first limitation rather than implying completeness', () => {
  const { config, cleanup } = makeInstance({ type_codes: { CHR: 'Chronicle' } });
  const index = buildIndex(sample(), { generatedAt: AT });
  const entry = generateEntries(index, config, { date: '2026-08-17' })[0];
  assert.match(entry.contents, /no claim/i);
  assert.match(entry.contents, /capability layer is not yet\s+settled/);
  cleanup();
});

test('generation is repeatable — same index yields identical output', () => {
  const { config, cleanup } = makeInstance({ type_codes: { CHR: 'Chronicle' } });
  const index = buildIndex(sample(), { generatedAt: AT });
  const a = generateEntries(index, config, { date: '2026-08-17' });
  const b = generateEntries(index, config, { date: '2026-08-17' });
  assert.deepEqual(a.map((e) => e.contents), b.map((e) => e.contents));
  cleanup();
});

test('refuses an unconfigured type code or audience rather than guessing', () => {
  const { config, cleanup } = makeInstance(); // no CHR configured
  const index = buildIndex(sample(), { generatedAt: AT });
  expectCode(() => generateEntries(index, config, { date: '2026-08-17' }), codes.ID_TYPE_UNKNOWN);
  expectCode(
    () => generateEntries(index, { ...config, type_codes: { CHR: 'Chronicle' } }, { date: '2026-08-17', audience: 'world' }),
    codes.AUDIENCE_UNKNOWN,
  );
  cleanup();
});

test('a remote-only repository generates a sound entry', () => {
  const { config, cleanup } = makeInstance({ type_codes: { CHR: 'Chronicle' } });
  const index = buildIndex(sample(), { generatedAt: AT });
  const beta = generateEntries(index, config, { date: '2026-08-17' })[1];
  assert.match(beta.contents, /no local clone/);
  cleanup();
});
