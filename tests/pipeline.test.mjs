/**
 * The publication pipeline end to end: approval gate, PDF, hashes, manifest
 * registration, canon freeze, amendments, superseding revisions, verify,
 * and the public export boundary.
 *
 * PDF-dependent tests skip cleanly when no Chromium is installed, so the
 * suite stays runnable on a machine without one.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { publish, exportPublic, verify, manifest, rendererAvailable, codes } from '../src/index.js';
import { makeInstance, writePaper, validPaper } from './helpers.js';

const HAVE_RENDERER = rendererAvailable({});
const pdfTest = (name, fn) => test(name, { skip: HAVE_RENDERER ? false : 'no Chromium available' }, fn);

function expectCode(fn, code) {
  try {
    fn();
  } catch (error) {
    assert.equal(error.code, code, `expected ${code}, got ${error.code}: ${error.message}`);
    return error;
  }
  assert.fail(`expected failure with code ${code}, but nothing was thrown`);
}

test('a draft cannot be canonized', () => {
  const { dir, config, cleanup } = makeInstance();
  const path = writePaper(dir, 'draft.md', validPaper({ status: 'draft' }));
  const err = expectCode(() => publish(path, config), codes.NOT_APPROVED);
  assert.match(err.message, /must reach 'review'/);
  cleanup();
});

test('dry run validates and writes nothing', () => {
  const { dir, config, cleanup } = makeInstance();
  const path = writePaper(dir, 'p.md', validPaper());
  const result = publish(path, config, { dryRun: true });

  assert.equal(result.dryRun, true);
  assert.equal(result.id, 'NW-2026-08-09-PHI-001');
  assert.match(result.source_sha256, /^[a-f0-9]{64}$/);
  assert.ok(!existsSync(join(dir, 'canon', 'NW-2026-08-09-PHI-001.pdf')));
  assert.ok(!existsSync(join(dir, 'manifests', 'library-manifest.json')));
  cleanup();
});

pdfTest('full pipeline produces PDF, both hashes, and a manifest entry', () => {
  const { dir, config, cleanup } = makeInstance();
  const path = writePaper(dir, 'p.md', validPaper());
  const result = publish(path, config);

  assert.equal(result.status, 'canon');
  assert.match(result.source_sha256, /^[a-f0-9]{64}$/);
  assert.match(result.pdf_sha256, /^[a-f0-9]{64}$/);
  assert.notEqual(result.source_sha256, result.pdf_sha256);
  assert.ok(existsSync(result.pdf), 'pdf written');
  assert.ok(existsSync(result.markdown), 'canon markdown written');
  assert.ok(readFileSync(result.pdf).subarray(0, 5).toString() === '%PDF-', 'is a real PDF');

  const m = manifest.load(config);
  const entry = manifest.getEntry(m, result.id);
  assert.equal(entry.status, 'canon');
  assert.equal(entry.audience, 'internal');
  assert.equal(entry.pdf_sha256, result.pdf_sha256);
  assert.ok(entry.frozen_at);

  // Human-readable manifest is regenerated alongside the JSON.
  const md = readFileSync(join(dir, 'manifests', 'library-manifest.md'), 'utf8');
  assert.match(md, /NW-2026-08-09-PHI-001/);
  cleanup();
});

pdfTest('canon cannot be silently overwritten', () => {
  const { dir, config, cleanup } = makeInstance();
  const path = writePaper(dir, 'p.md', validPaper());
  publish(path, config);

  // Same ID, edited content, published again — must be refused.
  writePaper(dir, 'p.md', validPaper({ title: 'Quietly Rewritten' }));
  const err = expectCode(() => publish(path, config), codes.CANON_FROZEN);
  assert.match(err.message, /already frozen as canon/);
  assert.match(err.message, /--amends|--supersedes/);

  // The frozen artifact still carries the original title.
  const frozen = readFileSync(join(dir, 'canon', 'NW-2026-08-09-PHI-001.md'), 'utf8');
  assert.match(frozen, /On the Purpose of an Institutional Archive/);
  assert.doesNotMatch(frozen, /Quietly Rewritten/);
  cleanup();
});

pdfTest('a superseding revision freezes a new paper and marks the prior superseded', () => {
  const { dir, config, cleanup } = makeInstance();
  publish(writePaper(dir, 'v1.md', validPaper()), config);

  const v2 = writePaper(
    dir,
    'v2.md',
    validPaper({
      id: 'NW-2026-08-10-PHI-002',
      date: '2026-08-10',
      title: 'On the Purpose of an Institutional Archive (Revised)',
      supersedes: 'NW-2026-08-09-PHI-001',
    }),
  );
  const result = publish(v2, config);
  assert.equal(result.supersededPrior, 'NW-2026-08-09-PHI-001');

  const m = manifest.load(config);
  assert.equal(manifest.getEntry(m, 'NW-2026-08-09-PHI-001').status, 'superseded');
  assert.equal(manifest.getEntry(m, 'NW-2026-08-09-PHI-001').superseded_by, 'NW-2026-08-10-PHI-002');
  assert.equal(manifest.getEntry(m, 'NW-2026-08-10-PHI-002').status, 'canon');

  // The superseded paper keeps its own artifacts and hashes.
  assert.ok(existsSync(join(dir, 'canon', 'NW-2026-08-09-PHI-001.pdf')));
  assert.ok(manifest.getEntry(m, 'NW-2026-08-09-PHI-001').pdf_sha256);
  cleanup();
});

pdfTest('an amendment records the relationship both ways', () => {
  const { dir, config, cleanup } = makeInstance();
  publish(writePaper(dir, 'base.md', validPaper()), config);

  const amendment = writePaper(
    dir,
    'amend.md',
    validPaper({
      id: 'NW-2026-08-11-PHI-003',
      date: '2026-08-11',
      title: 'Amendment to the Archive Paper',
      amends: 'NW-2026-08-09-PHI-001',
    }),
  );
  const result = publish(amendment, config);
  assert.equal(result.amendedPrior, 'NW-2026-08-09-PHI-001');

  const m = manifest.load(config);
  const base = manifest.getEntry(m, 'NW-2026-08-09-PHI-001');
  assert.equal(base.status, 'amended');
  assert.deepEqual(base.amended_by, ['NW-2026-08-11-PHI-003']);
  cleanup();
});

test('cannot supersede a paper that does not exist', () => {
  const { dir, config, cleanup } = makeInstance();
  const path = writePaper(dir, 'p.md', validPaper({ supersedes: 'NW-2026-01-01-PHI-009' }));
  expectCode(() => publish(path, config), codes.SUPERSEDE_TARGET_MISSING);
  cleanup();
});

pdfTest('an amended paper is still in force and can later be superseded', () => {
  const { dir, config, cleanup } = makeInstance();
  publish(writePaper(dir, 'base.md', validPaper()), config);

  // Amend it — the base paper remains the operative document.
  publish(
    writePaper(dir, 'amend.md', validPaper({
      id: 'NW-2026-08-10-PHI-002', date: '2026-08-10', amends: 'NW-2026-08-09-PHI-001',
    })),
    config,
  );

  // Later, a full revision supersedes it. canon -> amended -> superseded
  // is a normal archival lifecycle and must not be refused.
  const result = publish(
    writePaper(dir, 'v2.md', validPaper({
      id: 'NW-2026-08-11-PHI-003', date: '2026-08-11', supersedes: 'NW-2026-08-09-PHI-001',
    })),
    config,
  );
  assert.equal(result.supersededPrior, 'NW-2026-08-09-PHI-001');

  const base = manifest.getEntry(manifest.load(config), 'NW-2026-08-09-PHI-001');
  assert.equal(base.status, 'superseded');
  assert.equal(base.superseded_by, 'NW-2026-08-11-PHI-003');
  // The amendment history survives being superseded.
  assert.deepEqual(base.amended_by, ['NW-2026-08-10-PHI-002']);
  cleanup();
});

pdfTest('a paper can carry several amendments over time', () => {
  const { dir, config, cleanup } = makeInstance();
  publish(writePaper(dir, 'base.md', validPaper()), config);

  publish(writePaper(dir, 'a1.md', validPaper({
    id: 'NW-2026-08-10-PHI-002', date: '2026-08-10', amends: 'NW-2026-08-09-PHI-001',
  })), config);
  publish(writePaper(dir, 'a2.md', validPaper({
    id: 'NW-2026-08-11-PHI-003', date: '2026-08-11', amends: 'NW-2026-08-09-PHI-001',
  })), config);

  const base = manifest.getEntry(manifest.load(config), 'NW-2026-08-09-PHI-001');
  assert.deepEqual(base.amended_by, ['NW-2026-08-10-PHI-002', 'NW-2026-08-11-PHI-003']);
  cleanup();
});

pdfTest('a retired (superseded) paper cannot be amended, and says what to amend instead', () => {
  const { dir, config, cleanup } = makeInstance();
  publish(writePaper(dir, 'v1.md', validPaper()), config);
  publish(writePaper(dir, 'v2.md', validPaper({
    id: 'NW-2026-08-10-PHI-002', date: '2026-08-10', supersedes: 'NW-2026-08-09-PHI-001',
  })), config);

  const stray = writePaper(dir, 'stray.md', validPaper({
    id: 'NW-2026-08-11-PHI-004', date: '2026-08-11', amends: 'NW-2026-08-09-PHI-001',
  }));
  const err = expectCode(() => publish(stray, config), codes.AMEND_TARGET_NOT_CANON);
  assert.match(err.message, /already superseded by 'NW-2026-08-10-PHI-002'/);
  cleanup();
});

pdfTest('cannot supersede a paper that is not canon', () => {
  const { dir, config, cleanup } = makeInstance();
  publish(writePaper(dir, 'v1.md', validPaper()), config);
  publish(
    writePaper(dir, 'v2.md', validPaper({
      id: 'NW-2026-08-10-PHI-002', date: '2026-08-10', supersedes: 'NW-2026-08-09-PHI-001',
    })),
    config,
  );
  // v1 is now 'superseded', so a third paper may not supersede it again.
  const v3 = writePaper(dir, 'v3.md', validPaper({
    id: 'NW-2026-08-11-PHI-004', date: '2026-08-11', supersedes: 'NW-2026-08-09-PHI-001',
  }));
  expectCode(() => publish(v3, config), codes.SUPERSEDE_TARGET_NOT_CANON);
  cleanup();
});

pdfTest('verify passes for untouched canon and detects tampering', () => {
  const { dir, config, cleanup } = makeInstance();
  const result = publish(writePaper(dir, 'p.md', validPaper()), config);

  assert.equal(verify(config).ok, true);

  // Tamper with the PDF artifact.
  writeFileSync(result.pdf, Buffer.concat([readFileSync(result.pdf), Buffer.from('x')]));
  const after = verify(config);
  assert.equal(after.ok, false);
  assert.equal(after.results[0].problems[0].code, codes.INTEGRITY_PDF_MISMATCH);
  cleanup();
});

pdfTest('verify detects an edited canon source', () => {
  const { dir, config, cleanup } = makeInstance();
  const result = publish(writePaper(dir, 'p.md', validPaper()), config);

  const tampered = readFileSync(result.markdown, 'utf8').replace(
    'Fictional test content.',
    'Secretly altered content.',
  );
  writeFileSync(result.markdown, tampered, 'utf8');

  const after = verify(config);
  assert.equal(after.ok, false);
  assert.ok(after.results[0].problems.some((p) => p.code === codes.INTEGRITY_SOURCE_MISMATCH));
  cleanup();
});

pdfTest('public export refuses non-public canon and allows public canon', () => {
  const { dir, config, cleanup } = makeInstance();

  publish(writePaper(dir, 'internal.md', validPaper({ audience: 'investor' })), config);
  const err = expectCode(
    () => exportPublic('NW-2026-08-09-PHI-001', config),
    codes.AUDIENCE_NOT_PUBLIC,
  );
  assert.match(err.message, /refusing to publish publicly/);
  assert.ok(!existsSync(join(dir, 'public', 'NW-2026-08-09-PHI-001.pdf')));

  publish(
    writePaper(dir, 'pub.md', validPaper({
      id: 'NW-2026-08-12-PHI-005', date: '2026-08-12', audience: 'public',
    })),
    config,
  );
  const ok = exportPublic('NW-2026-08-12-PHI-005', config);
  assert.ok(existsSync(ok.pdf));
  cleanup();
});

pdfTest('publishing is atomic enough that a rejected republish leaves one manifest entry', () => {
  const { dir, config, cleanup } = makeInstance();
  const path = writePaper(dir, 'p.md', validPaper());
  publish(path, config);
  try { publish(path, config); } catch { /* expected CANON_FROZEN */ }

  const m = manifest.load(config);
  assert.equal(Object.keys(m.entries).length, 1);
  cleanup();
});
