/**
 * The publication pipeline.
 *
 *   Markdown -> metadata validation -> approval state -> PDF -> SHA-256
 *            -> manifest registration -> canon freeze
 *
 * Canon freeze is the load-bearing rule: once a paper is canon, publish()
 * refuses to touch it. A correction must arrive as an explicit amendment or
 * a superseding revision, both of which create NEW papers and leave the
 * original file and hashes untouched.
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { LibraryError, codes } from './errors.js';
import * as frontmatter from './frontmatter.js';
import { validateMetadata } from './metadata.js';
import { assertPubliclyReleasable } from './audience.js';
import { hashFile, hashString } from './hash.js';
import { htmlToPdf } from './pdf.js';
import { renderHtml } from './render.js';
import * as manifestStore from './manifest.js';

/** Statuses from which a paper may be promoted to canon. */
const APPROVABLE = new Set(['review', 'approved']);

/**
 * Statuses in which a published paper is still *in force*, and may
 * therefore be amended or superseded.
 *
 * An amended paper is still the operative document — an amendment attaches
 * a correction, it does not retire the paper. So `canon → amended →
 * superseded` is a normal lifecycle, as is a paper carrying several
 * amendments over time (which is why `amended_by` is a list).
 *
 * A superseded paper is retired: a later paper already replaced it, and
 * pointing a new amendment or revision at it instead of at its successor
 * is a modelling error worth refusing.
 */
const IN_FORCE = new Set(['canon', 'amended']);

function readPaper(sourcePath) {
  if (!existsSync(sourcePath)) {
    throw new LibraryError(
      codes.CANON_MISSING,
      `No paper found at '${sourcePath}'.`,
      { sourcePath },
    );
  }
  const raw = readFileSync(sourcePath, 'utf8');
  const label = basename(sourcePath);
  const { metadata, body } = frontmatter.parse(raw, label);
  return { raw, metadata, body, label };
}

/**
 * Publish a paper to canon.
 *
 * @param {string} sourcePath path to the Markdown paper
 * @param {object} config loaded instance config
 * @param {object} [options]
 * @param {boolean} [options.dryRun] validate and render, but write nothing permanent
 * @param {boolean} [options.force] permitted ONLY for re-publishing a non-canon paper
 * @returns {object} result describing what happened
 */
export function publish(sourcePath, config, options = {}) {
  const { dryRun = false } = options;
  const { raw, metadata, body, label } = readPaper(sourcePath);

  validateMetadata(metadata, config, label);

  const manifest = manifestStore.load(config);
  const existing = manifestStore.getEntry(manifest, metadata.id);

  // ---- Canon freeze -----------------------------------------------------
  // A paper already frozen as canon is immutable. This is checked before any
  // rendering or writing so a frozen paper cannot even be partially rewritten.
  if (existing && existing.status === 'canon') {
    throw new LibraryError(
      codes.CANON_FROZEN,
      `${label}: '${metadata.id}' is already frozen as canon (frozen ${existing.frozen_at}). Canon is never silently overwritten. To correct it, publish an amendment (--amends ${metadata.id}) or a superseding revision (--supersedes ${metadata.id}) with a NEW id.`,
      { id: metadata.id, frozenAt: existing.frozen_at },
    );
  }

  // ---- Approval state ---------------------------------------------------
  if (!APPROVABLE.has(metadata.status) && metadata.status !== 'canon') {
    throw new LibraryError(
      codes.NOT_APPROVED,
      `${label}: status is '${metadata.status}'. A paper must reach 'review' (approved) before it can be canonized. The publication path is draft -> review -> approval -> PDF -> hash -> manifest -> freeze.`,
      { id: metadata.id, status: metadata.status },
    );
  }

  // ---- Relationship integrity ------------------------------------------
  if (metadata.supersedes) {
    const target = manifestStore.getEntry(manifest, metadata.supersedes);
    if (!target) {
      throw new LibraryError(
        codes.SUPERSEDE_TARGET_MISSING,
        `${label}: declares supersedes '${metadata.supersedes}', but no such paper exists in the manifest.`,
        { id: metadata.id, target: metadata.supersedes },
      );
    }
    if (!IN_FORCE.has(target.status)) {
      const because =
        target.status === 'superseded'
          ? ` It was already superseded by '${target.superseded_by}' — supersede that paper instead.`
          : '';
      throw new LibraryError(
        codes.SUPERSEDE_TARGET_NOT_CANON,
        `${label}: cannot supersede '${metadata.supersedes}' — its status is '${target.status}', and only a paper still in force (canon or amended) can be superseded.${because}`,
        { id: metadata.id, target: metadata.supersedes, targetStatus: target.status },
      );
    }
  }

  if (metadata.amends) {
    const target = manifestStore.getEntry(manifest, metadata.amends);
    if (!target) {
      throw new LibraryError(
        codes.AMEND_TARGET_MISSING,
        `${label}: declares amends '${metadata.amends}', but no such paper exists in the manifest.`,
        { id: metadata.id, target: metadata.amends },
      );
    }
    if (!IN_FORCE.has(target.status)) {
      const because =
        target.status === 'superseded'
          ? ` It was already superseded by '${target.superseded_by}' — amend that paper instead.`
          : '';
      throw new LibraryError(
        codes.AMEND_TARGET_NOT_CANON,
        `${label}: cannot amend '${metadata.amends}' — its status is '${target.status}', and only a paper still in force (canon or amended) can be amended.${because}`,
        { id: metadata.id, target: metadata.amends, targetStatus: target.status },
      );
    }
  }

  // ---- Render -----------------------------------------------------------
  const html = renderHtml(metadata, body, config);
  const canonDir = config.resolved.canon;
  const pdfName = `${metadata.id}.pdf`;
  const mdName = `${metadata.id}.md`;
  const pdfPath = join(canonDir, pdfName);
  const mdPath = join(canonDir, mdName);

  if (dryRun) {
    return {
      dryRun: true,
      id: metadata.id,
      title: metadata.title,
      audience: metadata.audience,
      status: metadata.status,
      wouldWrite: { markdown: mdPath, pdf: pdfPath },
      source_sha256: hashString(raw),
      htmlBytes: Buffer.byteLength(html, 'utf8'),
    };
  }

  mkdirSync(canonDir, { recursive: true });
  htmlToPdf(html, pdfPath, config);

  // ---- Freeze -----------------------------------------------------------
  // The canon Markdown is a frozen copy carrying the final metadata,
  // including the hashes. The working paper under papers/ is left alone.
  const frozenAt = new Date().toISOString();
  const pdfSha = hashFile(pdfPath);

  const frozenMetadata = {
    ...metadata,
    status: 'canon',
    frozen_at: frozenAt,
    markdown_source: relative(config.baseDir, mdPath),
    pdf: relative(config.baseDir, pdfPath),
    pdf_hash: pdfSha,
  };

  // The source hash covers the canon Markdown exactly as frozen, so
  // verification can recompute it from the stored file.
  const withoutSourceHash = frontmatter.serialise(
    { ...frozenMetadata, source_sha256: null },
    body,
  );
  const sourceSha = hashString(withoutSourceHash);
  const finalDocument = frontmatter.serialise(
    { ...frozenMetadata, source_sha256: sourceSha },
    body,
  );
  writeFileSync(mdPath, finalDocument, 'utf8');

  manifestStore.upsertEntry(manifest, {
    id: metadata.id,
    title: metadata.title,
    date: metadata.date,
    status: 'canon',
    audience: metadata.audience,
    supersedes: metadata.supersedes ?? null,
    amends: metadata.amends ?? null,
    markdown: relative(config.baseDir, mdPath),
    pdf: relative(config.baseDir, pdfPath),
    source_sha256: sourceSha,
    pdf_sha256: pdfSha,
    frozen_at: frozenAt,
  });

  // A superseded paper stays exactly where it is; only its status changes,
  // and it keeps its own hashes so its integrity remains checkable.
  if (metadata.supersedes) {
    const prior = manifestStore.getEntry(manifest, metadata.supersedes);
    manifestStore.upsertEntry(manifest, {
      ...prior,
      status: 'superseded',
      superseded_by: metadata.id,
    });
  }

  if (metadata.amends) {
    const prior = manifestStore.getEntry(manifest, metadata.amends);
    manifestStore.upsertEntry(manifest, {
      ...prior,
      status: 'amended',
      amended_by: [...(prior.amended_by ?? []), metadata.id],
    });
  }

  manifestStore.save(manifest, config);

  return {
    dryRun: false,
    id: metadata.id,
    title: metadata.title,
    audience: metadata.audience,
    status: 'canon',
    markdown: mdPath,
    pdf: pdfPath,
    source_sha256: sourceSha,
    pdf_sha256: pdfSha,
    frozen_at: frozenAt,
    supersededPrior: metadata.supersedes ?? null,
    amendedPrior: metadata.amends ?? null,
  };
}

/**
 * Export a canon paper to the public destination.
 * Fails closed: only the configured public audience is ever copied out.
 */
export function exportPublic(id, config) {
  const manifest = manifestStore.load(config);
  const entry = manifestStore.getEntry(manifest, id);

  if (!entry) {
    throw new LibraryError(
      codes.CANON_MISSING,
      `No paper '${id}' exists in the manifest.`,
      { id },
    );
  }

  // Gate on the frozen canon metadata, not on any caller-supplied value.
  assertPubliclyReleasable(entry, config, `${id}`);

  if (!config.resolved.publicExport) {
    throw new LibraryError(
      codes.CONFIG_INVALID,
      `No 'paths.public_export' is configured, so there is nowhere to publish publicly.`,
      { id },
    );
  }

  mkdirSync(config.resolved.publicExport, { recursive: true });
  const destPdf = join(config.resolved.publicExport, basename(entry.pdf));
  const destMd = join(config.resolved.publicExport, basename(entry.markdown));
  copyFileSync(join(config.baseDir, entry.pdf), destPdf);
  copyFileSync(join(config.baseDir, entry.markdown), destMd);

  return { id, audience: entry.audience, pdf: destPdf, markdown: destMd };
}

/**
 * Re-hash stored canon files and compare against the manifest.
 * Never regenerates the PDF — see ADR-0003 for why that comparison
 * would be meaningless.
 */
export function verify(config, { id = null } = {}) {
  const manifest = manifestStore.load(config);
  const entries = id
    ? [manifestStore.getEntry(manifest, id)].filter(Boolean)
    : Object.values(manifest.entries);

  if (id && entries.length === 0) {
    throw new LibraryError(codes.CANON_MISSING, `No paper '${id}' exists in the manifest.`, { id });
  }

  const results = [];
  for (const entry of entries) {
    if (entry.status === 'draft' || entry.status === 'review') continue;

    const mdPath = join(config.baseDir, entry.markdown);
    const pdfPath = join(config.baseDir, entry.pdf);
    const problems = [];

    if (!existsSync(mdPath)) {
      problems.push({ code: codes.INTEGRITY_FILE_MISSING, detail: `missing markdown: ${entry.markdown}` });
    } else {
      const stored = readFileSync(mdPath, 'utf8');
      const { metadata, body } = frontmatter.parse(stored, entry.id);
      const recomputed = hashString(
        frontmatter.serialise({ ...metadata, source_sha256: null }, body),
      );
      if (recomputed !== entry.source_sha256) {
        problems.push({
          code: codes.INTEGRITY_SOURCE_MISMATCH,
          detail: `source hash mismatch (manifest ${entry.source_sha256.slice(0, 12)}…, file ${recomputed.slice(0, 12)}…)`,
        });
      }
    }

    if (!existsSync(pdfPath)) {
      problems.push({ code: codes.INTEGRITY_FILE_MISSING, detail: `missing pdf: ${entry.pdf}` });
    } else {
      const actual = hashFile(pdfPath);
      if (actual !== entry.pdf_sha256) {
        problems.push({
          code: codes.INTEGRITY_PDF_MISMATCH,
          detail: `pdf hash mismatch (manifest ${entry.pdf_sha256.slice(0, 12)}…, file ${actual.slice(0, 12)}…)`,
        });
      }
    }

    results.push({ id: entry.id, ok: problems.length === 0, problems });
  }

  return { ok: results.every((r) => r.ok), checked: results.length, results };
}
