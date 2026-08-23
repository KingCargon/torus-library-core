/**
 * Metadata, ID, and configuration validation.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { validateMetadata, parseId, validateId, loadConfigObject, codes } from '../src/index.js';
import * as frontmatter from '../src/frontmatter.js';
import { makeInstance, validPaper, FICTIONAL_CONFIG } from './helpers.js';

function expectCode(fn, code) {
  try {
    fn();
  } catch (error) {
    assert.equal(error.code, code, `expected ${code}, got ${error.code}: ${error.message}`);
    return error;
  }
  assert.fail(`expected failure with code ${code}, but nothing was thrown`);
}

test('accepts a well-formed paper', () => {
  const { config, cleanup } = makeInstance();
  assert.doesNotThrow(() => validateMetadata(validPaper(), config));
  cleanup();
});

test('rejects a missing required field', () => {
  const { config, cleanup } = makeInstance();
  const paper = validPaper();
  delete paper.title;
  const err = expectCode(() => validateMetadata(paper, config), codes.METADATA_INVALID);
  assert.match(err.message, /missing required field: title/);
  cleanup();
});

test('rejects an unrecognised field rather than silently ignoring it', () => {
  const { config, cleanup } = makeInstance();
  const err = expectCode(
    () => validateMetadata(validPaper({ audiance: 'public' }), config),
    codes.METADATA_INVALID,
  );
  assert.match(err.message, /unrecognised field: audiance/);
  cleanup();
});

test('rejects an invalid status', () => {
  const { config, cleanup } = makeInstance();
  expectCode(() => validateMetadata(validPaper({ status: 'published' }), config), codes.METADATA_INVALID);
  cleanup();
});

test('rejects a malformed ID', () => {
  expectCode(() => parseId('NW-2026-8-9-PHI-1'), codes.ID_MALFORMED);
});

test('rejects an ID whose prefix belongs to another library', () => {
  const { config, cleanup } = makeInstance();
  expectCode(
    () => validateId('TL-2026-08-09-PHI-001', config, '2026-08-09'),
    codes.ID_PREFIX_MISMATCH,
  );
  cleanup();
});

test('rejects an unconfigured type code', () => {
  const { config, cleanup } = makeInstance();
  const err = expectCode(
    () => validateId('NW-2026-08-09-ZZZ-001', config, '2026-08-09'),
    codes.ID_TYPE_UNKNOWN,
  );
  assert.match(err.message, /Known type codes: ADR, DIL, PHI/);
  cleanup();
});

test("rejects an ID whose date disagrees with the paper's declared date", () => {
  const { config, cleanup } = makeInstance();
  expectCode(
    () => validateMetadata(validPaper({ date: '2026-08-10' }), config),
    codes.ID_DATE_MISMATCH,
  );
  cleanup();
});

test('rejects a paper that supersedes itself', () => {
  const { config, cleanup } = makeInstance();
  expectCode(
    () => validateMetadata(validPaper({ supersedes: 'NW-2026-08-09-PHI-001' }), config),
    codes.SELF_REFERENCE,
  );
  cleanup();
});

test('rejects a document with no front matter', () => {
  expectCode(() => frontmatter.parse('# Just a heading\n', 'x.md'), codes.FRONTMATTER_MISSING);
});

test('rejects malformed YAML front matter', () => {
  expectCode(
    () => frontmatter.parse('---\ntitle: "unterminated\n---\nbody\n', 'x.md'),
    codes.FRONTMATTER_MALFORMED,
  );
});

test('round-trips front matter without disturbing the body', () => {
  const body = '## Summary\n\nBody text with `code` and a | pipe.\n';
  const round = frontmatter.parse(frontmatter.serialise(validPaper(), body), 'x.md');
  assert.equal(round.body, body);
  assert.equal(round.metadata.id, 'NW-2026-08-09-PHI-001');
});

test('rejects a config whose public_audience is not among its audiences', () => {
  const bad = { ...structuredClone(FICTIONAL_CONFIG), public_audience: 'world' };
  const err = expectCode(() => loadConfigObject(bad, '/tmp'), codes.CONFIG_INVALID);
  assert.match(err.message, /not present in audiences/);
});

test('rejects a config with a malformed id_prefix', () => {
  const bad = { ...structuredClone(FICTIONAL_CONFIG), id_prefix: 'lowercase' };
  expectCode(() => loadConfigObject(bad, '/tmp'), codes.CONFIG_INVALID);
});
