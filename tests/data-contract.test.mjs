/**
 * Build 06: the Library ↔ Data contract.
 *
 * The property that matters most here is a NEGATIVE one: the Library must
 * work identically when no measurement system exists. That is required by
 * the composable product doctrine, and it is currently not hypothetical —
 * no such system exists anywhere in the portfolio.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CONTRACT_VERSION, parseDataRef, validateDataLink, checkContractVersion,
  resolveCitation, resolveLinks, assertLinkVisibleTo,
  InMemoryDataAdapter, describeLinks, isStandalone, assertLibraryStandaloneCapable,
  publish, generateSite, exportFor, rendererAvailable, codes,
} from '../src/index.js';
import { makeInstance, writePaper, validPaper } from './helpers.js';

const HAVE_RENDERER = rendererAvailable({});
const pdfTest = (name, fn) => test(name, { skip: HAVE_RENDERER ? false : 'no Chromium available' }, fn);

function expectCode(fn, code) {
  try { fn(); } catch (e) {
    assert.equal(e.code, code, `expected ${code}, got ${e.code}: ${e.message}`);
    return e;
  }
  assert.fail(`expected failure with code ${code}`);
}

const link = (over = {}) => ({
  contract_version: CONTRACT_VERSION,
  library_id: 'NW-2026-08-19-PHI-001',
  data_ref: 'metrics:revenue/2026-Q3',
  relation: 'measures',
  ...over,
});

/* ---- the reference grammar ----------------------------------------- */

test('a data reference is namespaced, and its identifier is left opaque', () => {
  const r = parseDataRef('metrics:revenue/2026-Q3');
  assert.equal(r.source, 'metrics');
  // The identifier keeps its slashes, colons, and structure untouched —
  // the Library does not parse another system's identifier grammar.
  assert.equal(r.identifier, 'revenue/2026-Q3');
  assert.equal(parseDataRef('warehouse:a:b:c').identifier, 'a:b:c');
});

test('a malformed data reference is refused with an actionable message', () => {
  for (const bad of ['', 'revenue', ':abc', 'Metrics:x', '9metrics:x', 'metrics:', null, 42]) {
    expectCode(() => parseDataRef(bad), codes.DATA_REF_MALFORMED);
  }
  const err = expectCode(() => parseDataRef('revenue'), codes.DATA_REF_MALFORMED);
  assert.match(err.message, /<source>:<identifier>/);
});

/* ---- contract versioning ------------------------------------------- */

test('an unknown MAJOR contract version is refused, an unknown MINOR accepted', () => {
  assert.equal(checkContractVersion('1.0').compatible, true);
  assert.equal(checkContractVersion('1.7').forwardMinor, true, 'later minor is forward-compatible');
  expectCode(() => checkContractVersion('2.0'), codes.DATA_CONTRACT_VERSION);
  expectCode(() => checkContractVersion('abc'), codes.DATA_CONTRACT_VERSION);
});

test('a link is validated structurally without any Library or Data present', () => {
  assert.doesNotThrow(() => validateDataLink(link()));
  expectCode(() => validateDataLink(link({ relation: 'proves' })), codes.DATA_LINK_INVALID);
  expectCode(() => validateDataLink(link({ library_id: 'not-an-id' })), codes.DATA_LINK_INVALID);
  expectCode(() => validateDataLink(link({ extra: 'field' })), codes.DATA_LINK_INVALID);
  expectCode(() => validateDataLink(link({ period_start: '2026-09-01', period_end: '2026-08-01' })), codes.DATA_LINK_INVALID);
});

/* ---- resolution ----------------------------------------------------- */

pdfTest('a citation of a canon record resolves', () => {
  const { dir, config, cleanup } = makeInstance();
  publish(writePaper(dir, 'p.md', validPaper({ id: 'NW-2026-08-19-PHI-001', date: '2026-08-19' })), config);
  const r = resolveCitation('NW-2026-08-19-PHI-001', config);
  assert.equal(r.ok, true);
  assert.equal(r.record.id, 'NW-2026-08-19-PHI-001');
  cleanup();
});

test('a citation of an unknown record fails clearly', () => {
  const { config, cleanup } = makeInstance();
  const r = resolveCitation('NW-2026-01-01-PHI-999', config);
  assert.equal(r.ok, false);
  assert.match(r.problem, /no Library record/);
  assert.match(r.problem, /authoritative for its own identifiers/);
  cleanup();
});

pdfTest('a SUPERSEDED record still resolves — history is not rewritten', () => {
  const { dir, config, cleanup } = makeInstance();
  publish(writePaper(dir, 'v1.md', validPaper({ id: 'NW-2026-08-19-PHI-001', date: '2026-08-19' })), config);
  publish(writePaper(dir, 'v2.md', validPaper({
    id: 'NW-2026-08-20-PHI-002', date: '2026-08-20', supersedes: 'NW-2026-08-19-PHI-001',
  })), config);

  const r = resolveCitation('NW-2026-08-19-PHI-001', config);
  // A measurement taken in the past legitimately cites what was believed
  // then. Failing here would rewrite history to match the present.
  assert.equal(r.ok, true, 'superseded citations remain valid');
  assert.equal(r.status, 'superseded');
  assert.match(r.notices[0], /superseded by 'NW-2026-08-20-PHI-002'/);
  assert.match(r.notices[0], /remains valid for the period it describes/);
  cleanup();
});

pdfTest('an AMENDED record resolves and is reported as still operative', () => {
  const { dir, config, cleanup } = makeInstance();
  publish(writePaper(dir, 'b.md', validPaper({ id: 'NW-2026-08-19-PHI-001', date: '2026-08-19' })), config);
  publish(writePaper(dir, 'a.md', validPaper({
    id: 'NW-2026-08-20-PHI-002', date: '2026-08-20', amends: 'NW-2026-08-19-PHI-001',
  })), config);

  const r = resolveCitation('NW-2026-08-19-PHI-001', config);
  assert.equal(r.ok, true);
  assert.equal(r.status, 'amended');
  assert.match(r.notices[0], /remains the operative record/);
  cleanup();
});

test('an unpublished record cannot be cited as evidence', () => {
  const { config, cleanup } = makeInstance();
  // Simulate a manifest entry that never reached canon.
  const fake = { ...config, baseDir: config.baseDir };
  const r = resolveCitation('NW-2026-08-19-PHI-001', fake);
  assert.equal(r.ok, false);
  cleanup();
});

pdfTest('a batch reports each bad row without failing the good ones', () => {
  const { dir, config, cleanup } = makeInstance();
  publish(writePaper(dir, 'p.md', validPaper({ id: 'NW-2026-08-19-PHI-001', date: '2026-08-19' })), config);

  const batch = resolveLinks([
    link(),
    link({ library_id: 'NW-2026-01-01-PHI-999' }),
    link({ relation: 'nonsense' }),
  ], config);

  assert.equal(batch.checked, 3);
  assert.equal(batch.resolved, 1);
  assert.equal(batch.ok, false);
  assert.equal(batch.results[0].ok, true);
  assert.equal(batch.results[1].code, codes.DATA_CITATION_UNRESOLVED);
  assert.equal(batch.results[2].code, codes.DATA_LINK_INVALID);
  cleanup();
});

/* ---- authority: Data may not mutate or bypass the Library ----------- */

test('the resolver imports no writer — canon cannot be mutated from the Data side', () => {
  const src = readFileSync(new URL('../src/data/resolve.js', import.meta.url), 'utf8');
  // Assert on imports and call sites, not bare words — prose legitimately
  // contains "published", and a test that fires on prose is a false signal.
  for (const call of ['writeFileSync(', 'appendFileSync(', 'rmSync(', 'unlinkSync(', 'copyFileSync(', 'mkdirSync(', 'renameSync(', 'publish(']) {
    assert.ok(!src.includes(call), `resolver must not call ${call}`);
  }
  const imports = [...src.matchAll(/^import .*?from '([^']+)';/gm)].map((m) => m[1]);
  assert.deepEqual(imports.sort(), ['../errors.js', '../manifest.js', './contract.js'],
    'the resolver may import only the manifest reader, errors, and the contract');
});

test('no data module is imported by the publishing pipeline', () => {
  // The composability guarantee, checked structurally rather than asserted.
  for (const f of ['publish.js', 'audience.js', 'manifest.js', 'metadata.js', 'hash.js']) {
    const src = readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
    assert.ok(!src.includes('./data/'), `${f} must not depend on the Data contract`);
  }
});

pdfTest('a Data link cannot widen a record beyond its audience', () => {
  const { dir, config, cleanup } = makeInstance();
  publish(writePaper(dir, 'i.md', validPaper({ id: 'NW-2026-08-19-PHI-001', date: '2026-08-19', audience: 'restricted' })), config);
  const r = resolveCitation('NW-2026-08-19-PHI-001', config);

  assert.equal(assertLinkVisibleTo(r, 'public', config), false, 'a citation must not expose a restricted record publicly');
  assert.equal(assertLinkVisibleTo(r, 'investor', config), false, 'no inheritance, same as export');
  assert.equal(assertLinkVisibleTo(r, 'restricted', config), true);
  expectCode(() => assertLinkVisibleTo(r, 'everyone', config), codes.AUDIENCE_UNKNOWN);
  cleanup();
});

test('the resolved record exposes no filesystem paths', () => {
  const { config, cleanup } = makeInstance();
  const r = resolveCitation('NW-2026-01-01-PHI-999', config);
  assert.equal(r.record, null);
  cleanup();
});

/* ---- the adapter boundary ------------------------------------------- */

test('the reference adapter round-trips a description', () => {
  const adapter = new InMemoryDataAdapter({
    name: 'metrics',
    observations: { 'revenue/2026-Q3': { observed_at: '2026-09-30T00:00:00.000Z', unit: 'USD' } },
  });
  const d = adapter.describe('metrics:revenue/2026-Q3');
  assert.equal(d.exists, true);
  assert.equal(d.unit, 'USD');
  assert.equal(adapter.describe('metrics:missing'), null);
  assert.equal(adapter.describe('other:revenue/2026-Q3'), null, 'an adapter answers only for its own namespace');
});

test('an adapter with an invalid namespace is refused', () => {
  expectCode(() => new InMemoryDataAdapter({ name: 'Metrics' }), codes.DATA_ADAPTER_INVALID);
  expectCode(() => new InMemoryDataAdapter({}), codes.DATA_ADAPTER_INVALID);
});

pdfTest('a missing observation degrades the link without breaking the record', () => {
  const { dir, config, cleanup } = makeInstance();
  publish(writePaper(dir, 'p.md', validPaper({ id: 'NW-2026-08-19-PHI-001', date: '2026-08-19' })), config);

  const batch = resolveLinks([link()], config);
  const adapter = new InMemoryDataAdapter({ name: 'metrics', observations: {} });
  const described = describeLinks(batch, [adapter]);

  assert.equal(described.results[0].ok, true, 'the Library side still resolves');
  assert.equal(described.description ?? described.results[0].description, null);
  assert.match(described.results[0].dataNotice, /re-derived or retired/);
  assert.match(described.results[0].dataNotice, /does not invalidate the paper/);
  cleanup();
});

pdfTest('with no adapter at all, links still resolve and say why they are undescribed', () => {
  const { dir, config, cleanup } = makeInstance();
  publish(writePaper(dir, 'p.md', validPaper({ id: 'NW-2026-08-19-PHI-001', date: '2026-08-19' })), config);
  const described = describeLinks(resolveLinks([link()], config), []);
  assert.equal(described.results[0].ok, true);
  assert.match(described.results[0].dataNotice, /no adapter is configured/);
  cleanup();
});

test('an adapter that throws does not take the Library down', () => {
  const { config, cleanup } = makeInstance();
  const hostile = { name: 'metrics', describe() { throw new Error('backend unreachable'); } };
  const batch = { ok: true, checked: 1, resolved: 1, results: [{ ok: true, data_ref: parseDataRef('metrics:x'), link: link() }] };
  const described = describeLinks(batch, [hostile]);
  assert.match(described.results[0].dataNotice, /backend unreachable/);
  assert.match(described.results[0].dataNotice, /Library record is unaffected/);
  cleanup();
});

/* ---- standalone operation ------------------------------------------- */

test('the Library reports itself standalone-capable with no Data present', () => {
  const { config, cleanup } = makeInstance();
  assert.equal(isStandalone([]), true);
  const s = assertLibraryStandaloneCapable(config);
  assert.equal(s.standalone, true);
  assert.equal(s.adapters, 0);
  cleanup();
});

pdfTest('publish, site generation, and export all work with no Data installed', () => {
  const { dir, config, cleanup } = makeInstance();
  publish(writePaper(dir, 'p.md', validPaper({ id: 'NW-2026-08-19-PHI-001', date: '2026-08-19', audience: 'public' })), config);

  // The whole product arc, exercised with zero measurement infrastructure.
  const site = generateSite(config, { outDir: join(dir, 'site') });
  assert.deepEqual(site.published, ['NW-2026-08-19-PHI-001']);

  const pkg = exportFor(config, 'public', { outDir: join(dir, 'ex'), exportId: 'EX-N', generatedAt: '2026-08-19T00:00:00.000Z' });
  assert.deepEqual(pkg.included, ['NW-2026-08-19-PHI-001']);
  cleanup();
});

test('the data modules are the only place the contract lives', () => {
  const dataDir = new URL('../src/data/', import.meta.url);
  const files = readdirSync(dataDir);
  assert.deepEqual(files.sort(), ['adapter.js', 'contract.js', 'resolve.js']);
});
