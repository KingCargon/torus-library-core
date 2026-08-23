/**
 * `init` — the first five minutes for someone who has never seen this
 * product. If this is bad, nothing else matters.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initLibrary, loadConfigFile, validateMetadata, codes } from '../src/index.js';
import * as frontmatter from '../src/frontmatter.js';

function tmp() { return mkdtempSync(join(tmpdir(), 'init-')); }

function expectCode(fn, code) {
  try { fn(); } catch (e) { assert.equal(e.code, code); return e; }
  assert.fail(`expected ${code}`);
}

test('init creates a working library from nothing', () => {
  const dir = tmp();
  const r = initLibrary({ dir, organisation: 'Northwind Institute', prefix: 'NW', date: '2026-08-23' });
  assert.ok(existsSync(r.configPath));
  assert.ok(existsSync(r.seedPath));
  for (const d of ['papers', 'canon', 'manifests', 'references']) {
    assert.ok(existsSync(join(dir, d)), `${d}/ created`);
  }
  rmSync(dir, { recursive: true, force: true });
});

test('the generated config is valid and loads', () => {
  const dir = tmp();
  const r = initLibrary({ dir, organisation: 'Acme Corp', prefix: 'ACME', date: '2026-08-23' });
  const config = loadConfigFile(r.configPath);
  assert.equal(config.id_prefix, 'ACME');
  assert.equal(config.organisation.name, 'Acme Corp');
  assert.equal(config.public_audience, 'public');
  rmSync(dir, { recursive: true, force: true });
});

test('the seeded paper validates against the real schema', () => {
  const dir = tmp();
  const r = initLibrary({ dir, organisation: 'Acme Corp', prefix: 'ACME', date: '2026-08-23' });
  const config = loadConfigFile(r.configPath);
  const { metadata } = frontmatter.parse(readFileSync(r.seedPath, 'utf8'), 'seed');
  assert.doesNotThrow(() => validateMetadata(metadata, config, 'seed'));
  assert.equal(metadata.status, 'draft', 'the seed must not arrive pre-approved');
  rmSync(dir, { recursive: true, force: true });
});

test('a bad prefix is refused with an explanation of why it is permanent', () => {
  const dir = tmp();
  for (const prefix of ['a', 'acme', 'TOOLONGPREFIX', '1AB', '', undefined]) {
    const err = expectCode(() => initLibrary({ dir, organisation: 'X', prefix }), codes.CONFIG_INVALID);
    assert.match(err.message, /prefix/i);
  }
  rmSync(dir, { recursive: true, force: true });
});

test('init refuses to overwrite an existing library unless forced', () => {
  const dir = tmp();
  initLibrary({ dir, organisation: 'Acme', prefix: 'ACME', date: '2026-08-23' });
  const err = expectCode(() => initLibrary({ dir, organisation: 'Other', prefix: 'OTHR' }), codes.CONFIG_INVALID);
  assert.match(err.message, /already exists/);
  assert.doesNotThrow(() => initLibrary({ dir, organisation: 'Other', prefix: 'OTHR', force: true }));
  rmSync(dir, { recursive: true, force: true });
});

test('init requires an organisation name', () => {
  const dir = tmp();
  expectCode(() => initLibrary({ dir, prefix: 'NW' }), codes.CONFIG_INVALID);
  rmSync(dir, { recursive: true, force: true });
});

test('nothing about the author\'s own organisation is baked into the scaffold', () => {
  const dir = tmp();
  const r = initLibrary({ dir, organisation: 'Acme Corp', prefix: 'ACME', date: '2026-08-23' });
  const blob = readFileSync(r.configPath, 'utf8') + readFileSync(r.seedPath, 'utf8');
  // A scaffold that mentions its author's company is not a product.
  // Only the organisation the user named may appear.
  assert.ok(blob.includes('Acme Corp'));
  for (const term of ['Northwind', 'Example', 'Torus Library']) {
    assert.ok(!blob.includes(term), `scaffold must not mention ${term}`);
  }
  rmSync(dir, { recursive: true, force: true });
});
