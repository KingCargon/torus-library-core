/**
 * Test helpers: build a throwaway library instance in a temp directory.
 *
 * Tests deliberately run against a FICTIONAL organisation ("Northwind
 * Institute"). That is not decoration: if the engine carried any
 * assumption about one particular company, these tests would fail. They
 * are the standing proof that the engine is genuinely reusable.
 */

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfigObject } from '../src/index.js';

export const FICTIONAL_CONFIG = {
  id_prefix: 'NW',
  organisation: { name: 'Northwind Institute', imprint: 'Northwind Library' },
  type_codes: { PHI: 'Philosophy', ADR: 'Decision record', DIL: 'Diligence' },
  audiences: ['public', 'internal', 'investor', 'restricted'],
  public_audience: 'public',
  paths: {
    papers: 'papers',
    canon: 'canon',
    manifest: 'manifests/library-manifest.json',
    public_export: 'public',
  },
};

export function makeInstance(overrides = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'library-test-'));
  mkdirSync(join(dir, 'papers'), { recursive: true });
  const raw = { ...structuredClone(FICTIONAL_CONFIG), ...overrides };
  const config = loadConfigObject(raw, dir);
  return {
    dir,
    config,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

export function writePaper(dir, filename, metadata, body = '## Summary\n\nFictional test content.\n') {
  const lines = Object.entries(metadata).map(([k, v]) => {
    if (Array.isArray(v)) return `${k}: [${v.map((x) => JSON.stringify(x)).join(', ')}]`;
    if (v === null) return `${k}: null`;
    return `${k}: ${JSON.stringify(v)}`;
  });
  const contents = `---\n${lines.join('\n')}\n---\n\n${body}`;
  const path = join(dir, 'papers', filename);
  writeFileSync(path, contents, 'utf8');
  return path;
}

export const validPaper = (over = {}) => ({
  id: 'NW-2026-08-09-PHI-001',
  title: 'On the Purpose of an Institutional Archive',
  date: '2026-08-09',
  authors: ['A. Fictional'],
  status: 'review',
  audience: 'internal',
  ...over,
});
