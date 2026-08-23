/**
 * Build 05 release gate: audience boundaries, secret rejection, export
 * integrity, and log safety.
 *
 * Any non-public leakage here is a release blocker.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  assertNoSecrets, scanText, validateReference, mostRestrictiveAudience,
  buildDiligenceIndex, renderDiligenceMarkdown, exportFor, isIncluded,
  readExportLog, verifyPackage, publish, rendererAvailable, codes,
} from '../src/index.js';
import { makeInstance, writePaper, validPaper } from './helpers.js';

const HAVE_RENDERER = rendererAvailable({});
const pdfTest = (name, fn) => test(name, { skip: HAVE_RENDERER ? false : 'no Chromium available' }, fn);
const AT = '2026-08-19T00:00:00.000Z';

function expectCode(fn, code) {
  try { fn(); } catch (e) {
    assert.equal(e.code, code, `expected ${code}, got ${e.code}: ${e.message}`);
    return e;
  }
  assert.fail(`expected failure with code ${code}`);
}

function allFiles(dir) {
  const out = [];
  const walk = (d) => { for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) walk(p);
    else out.push({ path: p, text: p.endsWith('.pdf') ? '' : readFileSync(p, 'utf8') });
  } };
  if (existsSync(dir)) walk(dir);
  return out;
}

const ref = (over = {}) => ({
  id: 'NW-2026-08-19-LEG-001',
  title: 'Master services agreement, Acme Corp',
  date: '2026-08-19',
  custodian: 'General Counsel',
  storage: { system: 'Corporate records vault', external_id: 'CASE-1182', locator: 'Legal/Contracts/2026' },
  classification: 'confidential',
  status: 'canon',
  ...over,
});

/* ---- secret detection --------------------------------------------- */

const SECRETS = [
  ['private key', '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIB\n-----END RSA PRIVATE KEY-----'],
  ['aws key id', 'AKIAIOSFODNN7EXAMPLE'],
  ['github token', 'ghp_abcdefghijklmnopqrstuvwxyz0123456789'],
  ['slack token', 'xoxb-123456789012-abcdefghijklmnop'],
  ['stripe key', 'sk_live_abcdefghijklmnopqrstuvwx'],
  ['google api key', 'AIzaSyA01234567890123456789012345678901'],
  ['openai key', 'sk-abcdefghijklmnopqrstuvwxyz0123'],
  ['jwt', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnop'],
  ['bearer token', 'Bearer abcdefghijklmnopqrstuvwxyz012345'],
  ['password assignment', 'password: hunter2horsebattery'],
  ['api_key assignment', 'api_key = "abcdef123456789012"'],
  ['connection string', 'postgres://admin:s3cr3tpassword@db.internal:5432/main'],
];

for (const [label, value] of SECRETS) {
  test(`secret scanner detects ${label}`, () => {
    assert.ok(scanText(value).length > 0, `${label} was not detected`);
  });
}

test('secret scanner allows descriptions of where credentials live', () => {
  const safe = [
    'access_notes: request via General Counsel',
    'password: withheld',
    'api_key: <held in the corporate vault>',
    'secret: redacted',
    'credentials: managed by IT operations',
    'The signing key is held by the CFO and never leaves the vault.',
  ];
  for (const s of safe) {
    assert.deepEqual(scanText(s), [], `false positive on: ${s}`);
  }
});

test('assertNoSecrets names the kind of secret but never echoes the value', () => {
  const err = expectCode(
    () => assertNoSecrets({ access_notes: 'token ghp_abcdefghijklmnopqrstuvwxyz0123456789' }, 'ref'),
    codes.PROHIBITED_SECRET,
  );
  assert.match(err.message, /GitHub token/i);
  assert.ok(!err.message.includes('ghp_abcdefghijklmnopqrstuvwxyz0123456789'), 'error must not echo the secret');
  assert.match(err.message, /not a secret store/);
});

test('secrets are detected at any depth, not just top-level fields', () => {
  expectCode(
    () => assertNoSecrets({ storage: { locator: 'AKIAIOSFODNN7EXAMPLE' } }, 'ref'),
    codes.PROHIBITED_SECRET,
  );
});

/* ---- restricted references ---------------------------------------- */

test('a well-formed restricted reference validates', () => {
  const { config, cleanup } = makeInstance({ type_codes: { LEG: 'Legal' } });
  const out = validateReference(ref(), config);
  assert.equal(out.id, 'NW-2026-08-19-LEG-001');
  cleanup();
});

test('omitting audience defaults to the MOST restrictive tier, never a wider one', () => {
  const { config, cleanup } = makeInstance({ type_codes: { LEG: 'Legal' } });
  assert.equal(mostRestrictiveAudience(config), 'restricted');
  assert.equal(validateReference(ref(), config).audience, 'restricted');
  cleanup();
});

test('a reference carrying a credential is refused', () => {
  const { config, cleanup } = makeInstance({ type_codes: { LEG: 'Legal' } });
  expectCode(
    () => validateReference(ref({ access_notes: 'use api_key = "abcdef123456789012"' }), config),
    codes.PROHIBITED_SECRET,
  );
  cleanup();
});

test('a pre-authenticated URL is refused as a locator', () => {
  const { config, cleanup } = makeInstance({ type_codes: { LEG: 'Legal' } });
  const err = expectCode(
    () => validateReference(ref({ storage: { system: 'S3', locator: 'https://x.s3.amazonaws.com/f?X-Amz-Signature=abc123' } }), config),
    codes.PROHIBITED_SECRET,
  );
  assert.match(err.message, /access grant, not a locator/);
  cleanup();
});

test('a reference with no custodian or storage is refused', () => {
  const { config, cleanup } = makeInstance({ type_codes: { LEG: 'Legal' } });
  const noCustodian = ref(); delete noCustodian.custodian;
  expectCode(() => validateReference(noCustodian, config), codes.REFERENCE_INVALID);
  const noStorage = ref(); delete noStorage.storage;
  expectCode(() => validateReference(noStorage, config), codes.REFERENCE_INVALID);
  cleanup();
});

test('unknown diligence categories and classifications are refused', () => {
  const { config, cleanup } = makeInstance({
    type_codes: { LEG: 'Legal' }, diligence_categories: ['legal'], classifications: ['confidential'],
  });
  expectCode(() => validateReference(ref({ diligence_categories: ['made-up'] }), config), codes.REFERENCE_INVALID);
  expectCode(() => validateReference(ref({ classification: 'ultra-secret' }), config), codes.REFERENCE_INVALID);
  cleanup();
});

/* ---- export boundaries --------------------------------------------- */

test('isIncluded fails closed on every ambiguous input', () => {
  const { config, cleanup } = makeInstance();
  for (const bad of [null, {}, { status: 'canon' }, { status: 'canon', audience: '' },
                     { status: 'canon', audience: 'pubic' }, { status: 'draft', audience: 'public' },
                     { status: 'superseded', audience: 'public' }, { audience: 'public' }]) {
    assert.equal(isIncluded(bad, config, ['public']), false, JSON.stringify(bad));
  }
  cleanup();
});

test('an unknown audience is refused rather than guessed', () => {
  const { config, cleanup } = makeInstance();
  expectCode(() => exportFor(config, 'shareholders'), codes.AUDIENCE_UNKNOWN);
  expectCode(() => exportFor(config, 'investor', { alsoInclude: ['nope'] }), codes.AUDIENCE_UNKNOWN);
  cleanup();
});

pdfTest('exportFor(audience) includes ONLY that audience — no silent inheritance', () => {
  const { dir, config, cleanup } = makeInstance();
  const mk = (n, audience, marker) => publish(
    writePaper(dir, `${audience}.md`, validPaper({ id: `NW-2026-08-19-PHI-00${n}`, date: '2026-08-19', audience }), `\n${marker}\n`),
    config,
  );
  mk(1, 'public', 'PUBLICBODY');
  mk(2, 'internal', 'INTERNALBODY');
  mk(3, 'investor', 'INVESTORBODY');
  mk(4, 'restricted', 'RESTRICTEDBODY');

  const res = exportFor(config, 'investor', { outDir: join(dir, 'ex'), exportId: 'EX-T', generatedAt: AT });
  assert.deepEqual(res.included, ['NW-2026-08-19-PHI-003'], 'investor export must contain investor only');

  const files = allFiles(res.outDir);
  for (const marker of ['PUBLICBODY', 'INTERNALBODY', 'RESTRICTEDBODY']) {
    for (const f of files) assert.ok(!f.text.includes(marker), `LEAK: ${marker} in ${f.path}`);
  }
  for (const id of ['NW-2026-08-19-PHI-001', 'NW-2026-08-19-PHI-002', 'NW-2026-08-19-PHI-004']) {
    for (const f of files) assert.ok(!f.text.includes(id), `LEAK: ${id} referenced in ${f.path}`);
  }
  cleanup();
});

pdfTest('widening scope requires naming each audience explicitly', () => {
  const { dir, config, cleanup } = makeInstance();
  publish(writePaper(dir, 'p.md', validPaper({ id: 'NW-2026-08-19-PHI-001', date: '2026-08-19', audience: 'public' })), config);
  publish(writePaper(dir, 'i.md', validPaper({ id: 'NW-2026-08-19-PHI-002', date: '2026-08-19', audience: 'investor' })), config);
  publish(writePaper(dir, 'r.md', validPaper({ id: 'NW-2026-08-19-PHI-003', date: '2026-08-19', audience: 'restricted' })), config);

  const res = exportFor(config, 'investor', { alsoInclude: ['public'], outDir: join(dir, 'ex'), exportId: 'EX-T', generatedAt: AT });
  assert.deepEqual(res.included, ['NW-2026-08-19-PHI-001', 'NW-2026-08-19-PHI-002']);
  assert.ok(!res.included.includes('NW-2026-08-19-PHI-003'), 'restricted never joins by opt-in of public');
  cleanup();
});

pdfTest('a public export can never contain internal, investor, or restricted content', () => {
  const { dir, config, cleanup } = makeInstance();
  let n = 1;
  for (const [audience, marker] of [['internal', 'INT_M'], ['investor', 'INV_M'], ['restricted', 'RES_M'], ['public', 'PUB_M']]) {
    publish(writePaper(dir, `${audience}.md`, validPaper({ id: `NW-2026-08-19-PHI-00${n}`, date: '2026-08-19', audience }), `\n${marker}\n`), config);
    n += 1;
  }
  const res = exportFor(config, 'public', { outDir: join(dir, 'ex'), exportId: 'EX-P', generatedAt: AT });
  assert.deepEqual(res.included, ['NW-2026-08-19-PHI-004']);
  const files = allFiles(res.outDir);
  for (const m of ['INT_M', 'INV_M', 'RES_M']) {
    for (const f of files) assert.ok(!f.text.includes(m), `LEAK: ${m}`);
  }
  cleanup();
});

pdfTest('drafts and superseded records never enter an export', () => {
  const { dir, config, cleanup } = makeInstance();
  publish(writePaper(dir, 'v1.md', validPaper({ id: 'NW-2026-08-19-PHI-001', date: '2026-08-19', audience: 'investor' }), '\nOLDBODY\n'), config);
  publish(writePaper(dir, 'v2.md', validPaper({
    id: 'NW-2026-08-20-PHI-002', date: '2026-08-20', audience: 'investor', supersedes: 'NW-2026-08-19-PHI-001',
  }), '\nNEWBODY\n'), config);

  const res = exportFor(config, 'investor', { outDir: join(dir, 'ex'), exportId: 'EX-S', generatedAt: AT });
  assert.deepEqual(res.included, ['NW-2026-08-20-PHI-002']);
  const files = allFiles(res.outDir);
  assert.ok(files.some((f) => f.text.includes('NEWBODY')));
  assert.ok(!files.some((f) => f.text.includes('OLDBODY')), 'superseded body must not be handed over');
  cleanup();
});

/* ---- package integrity + log --------------------------------------- */

pdfTest('a package verifies, and tampering is detected', () => {
  const { dir, config, cleanup } = makeInstance();
  publish(writePaper(dir, 'p.md', validPaper({ id: 'NW-2026-08-19-PHI-001', date: '2026-08-19', audience: 'investor' })), config);
  const res = exportFor(config, 'investor', { outDir: join(dir, 'ex'), exportId: 'EX-V', generatedAt: AT });

  assert.equal(verifyPackage(res.outDir).ok, true);

  const pdf = join(res.outDir, 'documents', 'NW-2026-08-19-PHI-001.pdf');
  writeFileSync(pdf, Buffer.concat([readFileSync(pdf), Buffer.from('tamper')]));
  const after = verifyPackage(res.outDir);
  assert.equal(after.ok, false);
  assert.match(after.problems[0].problem, /pdf hash mismatch/);
  cleanup();
});

pdfTest('repeated export of an unchanged corpus produces the same package hash', () => {
  const { dir, config, cleanup } = makeInstance();
  publish(writePaper(dir, 'p.md', validPaper({ id: 'NW-2026-08-19-PHI-001', date: '2026-08-19', audience: 'investor' })), config);
  const a = exportFor(config, 'investor', { outDir: join(dir, 'a'), exportId: 'EX-D', generatedAt: AT });
  const b = exportFor(config, 'investor', { outDir: join(dir, 'b'), exportId: 'EX-D', generatedAt: AT });
  assert.equal(a.packageHash, b.packageHash, 'package hash must be deterministic');
  cleanup();
});

pdfTest('the export log records what was generated and contains no document bodies', () => {
  const { dir, config, cleanup } = makeInstance();
  publish(writePaper(dir, 'p.md', validPaper({ id: 'NW-2026-08-19-PHI-001', date: '2026-08-19', audience: 'investor' }), '\nSECRETISHBODY\n'), config);
  const res = exportFor(config, 'investor', { outDir: join(dir, 'ex'), exportId: 'EX-L', generatedAt: AT, actor: 'local' });

  const log = readExportLog(config);
  assert.equal(log.exports.length, 1);
  const e = log.exports[0];
  assert.equal(e.export_id, 'EX-L');
  assert.equal(e.audience, 'investor');
  assert.deepEqual(e.document_ids, ['NW-2026-08-19-PHI-001']);
  assert.equal(e.package_sha256, res.packageHash);

  const raw = JSON.stringify(log);
  assert.ok(!raw.includes('SECRETISHBODY'), 'log must not contain document bodies');
  cleanup();
});

pdfTest('an export with nothing in scope produces an honest empty package', () => {
  const { dir, config, cleanup } = makeInstance();
  publish(writePaper(dir, 'i.md', validPaper({ id: 'NW-2026-08-19-PHI-001', date: '2026-08-19', audience: 'internal' })), config);
  const res = exportFor(config, 'investor', { outDir: join(dir, 'ex'), exportId: 'EX-E', generatedAt: AT });
  assert.deepEqual(res.included, []);
  const readme = readFileSync(join(res.outDir, 'README.md'), 'utf8');
  assert.match(readme, /contains no documents/);
  assert.ok(!readme.includes('NW-2026-08-19-PHI-001'));
  cleanup();
});

/* ---- diligence index ------------------------------------------------ */

test('the diligence index reports gaps rather than hiding them', () => {
  const { config, cleanup } = makeInstance({ diligence_categories: ['legal', 'security', 'insurance'] });
  const idx = buildDiligenceIndex(config, { generatedAt: AT });
  assert.equal(idx.counts.categories, 3);
  assert.equal(idx.counts.covered, 0);
  assert.equal(idx.counts.gaps, 3);
  const md = renderDiligenceMarkdown(idx, config);
  assert.match(md, /no recorded evidence/);
  cleanup();
});

test('the index invents no facts — an empty archive yields an empty index', () => {
  const { config, cleanup } = makeInstance();
  const idx = buildDiligenceIndex(config, { generatedAt: AT });
  assert.equal(idx.counts.canon_papers, 0);
  assert.equal(idx.counts.restricted_references, 0);
  for (const entry of Object.values(idx.categories)) {
    assert.deepEqual(entry.papers, []);
    assert.deepEqual(entry.references, []);
  }
  cleanup();
});

test('restricted references are indexed by category without exposing their content', () => {
  const { dir, config, cleanup } = makeInstance({
    type_codes: { LEG: 'Legal' }, diligence_categories: ['legal', 'security'], classifications: ['confidential'],
  });
  mkdirSync(join(dir, 'references'), { recursive: true });
  writeFileSync(join(dir, 'references', 'restricted-references.json'),
    JSON.stringify({ references: [ref({ diligence_categories: ['legal'] })] }, null, 2));

  const idx = buildDiligenceIndex(config, { generatedAt: AT });
  assert.equal(idx.counts.restricted_references, 1);
  assert.equal(idx.categories.legal.references.length, 1);
  assert.equal(idx.categories.legal.references[0].custodian, 'General Counsel');
  assert.ok(idx.gaps.includes('security'));
  cleanup();
});

test('a reference file containing a secret refuses to load', () => {
  const { dir, config, cleanup } = makeInstance({ type_codes: { LEG: 'Legal' } });
  mkdirSync(join(dir, 'references'), { recursive: true });
  writeFileSync(join(dir, 'references', 'restricted-references.json'),
    JSON.stringify({ references: [ref({ access_notes: 'ghp_abcdefghijklmnopqrstuvwxyz0123456789' })] }));
  expectCode(() => buildDiligenceIndex(config, { generatedAt: AT }), codes.PROHIBITED_SECRET);
  cleanup();
});

/* ---- no network surface -------------------------------------------- */

test('the engine opens no network listener — file handover only', () => {
  // A hosted data room would need one of these. Their absence in the
  // diligence modules is the structural proof that none exists (ADR-0010).
  const sources = ['export.js', 'reference.js', 'index-builder.js', 'secrets.js']
    .map((f) => readFileSync(new URL(`../src/diligence/${f}`, import.meta.url), 'utf8'))
    .join('\n');
  for (const forbidden of ['node:http', 'node:https', 'node:net', 'createServer', 'listen(', 'express', 'fetch(']) {
    assert.ok(!sources.includes(forbidden), `diligence modules must not use ${forbidden}`);
  }
});
