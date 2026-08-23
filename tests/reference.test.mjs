/**
 * Cross-repository reference parsing and resolution.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseReference, formatReference, resolveReference, extractReferences, buildIndex, codes,
} from '../src/index.js';

function expectCode(fn, code) {
  try { fn(); } catch (e) {
    assert.equal(e.code, code, `expected ${code}, got ${e.code}: ${e.message}`);
    return e;
  }
  assert.fail(`expected failure with code ${code}`);
}

test('parses a bare repository reference', () => {
  const r = parseReference('repo:ExampleOrg/example-repo');
  assert.deepEqual(
    { kind: r.kind, owner: r.owner, repo: r.repo, target: r.target },
    { kind: 'repository', owner: 'ExampleOrg', repo: 'example-repo', target: null },
  );
});

test('parses commit, build, branch, and release references', () => {
  assert.equal(parseReference('repo:ExampleOrg/example-repo@abc1234').kind, 'commit');
  assert.equal(parseReference('repo:ExampleOrg/example-repo@abc1234').target, 'abc1234');
  assert.equal(parseReference('repo:o/r#build/02-engine').kind, 'build');
  assert.equal(parseReference('repo:o/r#branch/main').target, 'main');
  assert.equal(parseReference('repo:o/r#release/v0.2.0').kind, 'release');
});

test('accepts a full-length commit hash', () => {
  const full = 'a'.repeat(40);
  assert.equal(parseReference(`repo:o/r@${full}`).target, full);
});

test('rejects malformed references', () => {
  for (const bad of ['', 'torus-library', 'repo:', 'repo:owner', 'repo:owner/', 'https://github.com/o/r']) {
    expectCode(() => parseReference(bad), codes.REFERENCE_MALFORMED);
  }
});

test('rejects a qualifier with an empty target', () => {
  expectCode(() => parseReference('repo:o/r#branch/'), codes.REFERENCE_MALFORMED);
});

test('rejects a commit hash that is too short to be meaningful', () => {
  expectCode(() => parseReference('repo:o/r@abc'), codes.REFERENCE_MALFORMED);
});

test('format is the inverse of parse', () => {
  for (const raw of [
    'repo:ExampleOrg/example-repo',
    'repo:ExampleOrg/example-repo@abc1234',
    'repo:ExampleOrg/example-repo#build/03-example',
    'repo:ExampleOrg/example-repo#release/v0.2.0',
  ]) {
    assert.equal(formatReference(parseReference(raw)), raw);
  }
});

test('resolves against a portfolio index, and reports what is missing', () => {
  const index = buildIndex([
    { owner: 'ExampleOrg', name: 'example-repo', branches: ['main', 'build/03-example'] },
  ], { generatedAt: '2026-08-17T00:00:00.000Z' });

  assert.equal(resolveReference('repo:ExampleOrg/example-repo', index).ok, true);
  assert.equal(resolveReference('repo:ExampleOrg/example-repo#branch/main', index).ok, true);

  const missingRepo = resolveReference('repo:ExampleOrg/does-not-exist', index);
  assert.equal(missingRepo.ok, false);
  assert.match(missingRepo.problem, /no repository/);

  const missingBranch = resolveReference('repo:ExampleOrg/example-repo#branch/nope', index);
  assert.equal(missingBranch.ok, false);
  assert.match(missingBranch.problem, /has no branch 'nope'/);
});

test('resolves regardless of owner/name casing', () => {
  const index = buildIndex([{ owner: 'ExampleOrg', name: 'example-repo' }], { generatedAt: '2026-08-17T00:00:00.000Z' });
  assert.equal(resolveReference('repo:exampleorg/example-repo', index).ok, true);
});

test('strips trailing sentence punctuation when extracting', () => {
  assert.deepEqual(extractReferences('See repo:Acme/alpha.'), ['repo:Acme/alpha']);
  assert.deepEqual(extractReferences('See repo:Acme/alpha#branch/main, then stop.'), ['repo:Acme/alpha#branch/main']);
});

test('extracts references from prose without duplicates', () => {
  const prose = `See repo:ExampleOrg/example-repo and repo:ExampleOrg/example-repo
    plus \`repo:ExampleOrg/other-repo@abc1234\` and repo:ExampleOrg/x#build/01-a.`;
  const found = extractReferences(prose);
  assert.equal(found.length, 3);
  assert.ok(found.includes('repo:ExampleOrg/other-repo@abc1234'));
});

test('extracting from a non-string yields nothing rather than throwing', () => {
  assert.deepEqual(extractReferences(null), []);
});
