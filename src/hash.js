/**
 * SHA-256 hashing.
 *
 * Two hashes are recorded per canon paper, with deliberately different
 * meanings (ADR-0003):
 *
 *   source_sha256 — over the Markdown source bytes. Deterministic and
 *                   reproducible: proves the canonized text is unchanged.
 *   pdf_sha256    — over the frozen PDF bytes. Tamper-evidence for the
 *                   artifact that was actually published.
 *
 * The PDF hash is NOT reproducible by re-rendering: the renderer embeds
 * generation timestamps. Verification re-hashes the STORED file; it never
 * regenerates and compares. Documentation must not claim otherwise.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export function hashBytes(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

export function hashString(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export function hashFile(path) {
  return hashBytes(readFileSync(path));
}
