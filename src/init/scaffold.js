/**
 * `init` — create a new library.
 *
 * The first thing a stranger needs is a library that exists. Before this
 * command the only path was to hand-write `library.config.json` from the
 * schema, which is a poor first five minutes for a product whose promise
 * is that an organisation can own its own institutional memory.
 *
 * The scaffold is deliberately generic: it asks for an organisation name
 * and an ID prefix, and writes a working configuration with a sensible
 * document-type registry and the four standard audiences. Nothing about
 * any particular company is baked in.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { LibraryError, codes } from '../errors.js';
import { DEFAULT_CATEGORIES } from '../diligence/index-builder.js';

/** A general-purpose starting registry. An instance may trim or extend it. */
export const DEFAULT_TYPE_CODES = {
  ORG: 'Origin',
  CHR: 'Chronicle',
  FLT: 'Founder letter',
  ADR: 'Decision record',
  PHI: 'Philosophy',
  CUL: 'Culture',
  DEF: 'Definition / ontology',
  SOP: 'Procedure',
  WHP: 'Whitepaper',
  PRD: 'Product brief',
  ARC: 'Architecture',
  SEC: 'Security',
  POL: 'Policy',
  DIL: 'Diligence',
  FIN: 'Financial',
  LEG: 'Legal',
  PPL: 'People',
  PST: 'Postmortem',
};

const FIRST_PAPER = (prefix, date, org) => `---
id: ${prefix}-${date}-PHI-001
title: "Why ${org} keeps a Library"
date: ${date}
authors: ["${org}"]
approvers: []
status: draft
audience: public
supersedes: null
amends: null
markdown_source: null
pdf: null
pdf_hash: null
source_sha256: null
frozen_at: null
related_products: []
related_builds: []
related_data_ids: []
licence_or_confidentiality: null
---

## Summary

Replace this with the first thing ${org} wants to remember on purpose.

## Why this exists

Most organisations record what happened and lose why it happened. Code
history survives, chat survives, files survive — and the reasoning behind
a decision evaporates within a year, usually along with the people who
held it.

A Library is the deliberate opposite. Every record is dated, classified,
rendered to PDF, hashed, and frozen. Nothing is edited in place. When
something changes, a new dated record either **amends** the original or
**supersedes** it, and what was previously believed is kept.

## How to publish this

\`\`\`
torus-library validate papers/${prefix}-${date}-PHI-001.md
\`\`\`

When the text is right, set \`status: review\`, add an approver, then:

\`\`\`
torus-library publish papers/${prefix}-${date}-PHI-001.md
\`\`\`

That freezes it. From then on this document can be amended or superseded,
but never quietly rewritten — which is the entire point.
`;

/**
 * @param {object} options
 * @param {string} options.dir        target directory
 * @param {string} options.organisation
 * @param {string} options.prefix     ID prefix, e.g. 'ACME'
 * @param {string} [options.imprint]
 * @param {string} [options.date]     YYYY-MM-DD for the seed paper
 * @param {boolean} [options.force]
 */
export function initLibrary({ dir, organisation, prefix, imprint = 'Library', date, force = false }) {
  if (!organisation || typeof organisation !== 'string') {
    throw new LibraryError(codes.CONFIG_INVALID, `init requires an organisation name (--organisation "Acme Corp").`, {});
  }
  if (!/^[A-Z][A-Z0-9]{1,7}$/.test(prefix ?? '')) {
    throw new LibraryError(
      codes.CONFIG_INVALID,
      `init requires an ID prefix of 2–8 uppercase characters (--prefix ACME). Every document identifier in this library will begin with it, permanently, so choose one you will still want in ten years.`,
      { prefix },
    );
  }

  const configPath = join(dir, 'library.config.json');
  if (existsSync(configPath) && !force) {
    throw new LibraryError(
      codes.CONFIG_INVALID,
      `A library already exists at ${configPath}. Refusing to overwrite it — pass --force only if you are certain.`,
      { configPath },
    );
  }

  const config = {
    id_prefix: prefix,
    organisation: { name: organisation, imprint },
    type_codes: DEFAULT_TYPE_CODES,
    audiences: ['public', 'internal', 'investor', 'restricted'],
    public_audience: 'public',
    diligence_categories: DEFAULT_CATEGORIES,
    classifications: ['public', 'confidential', 'highly-confidential'],
    paths: {
      papers: 'papers',
      canon: 'canon',
      manifest: 'manifests/library-manifest.json',
      public_export: 'public',
      references: 'references/restricted-references.json',
      exports: 'exports',
    },
    pdf: {
      renderer: 'chromium',
      footer_note: `${organisation} — ${imprint}. Canon document; see manifest for integrity hashes.`,
    },
  };

  for (const d of ['papers', 'canon', 'manifests', 'references']) {
    mkdirSync(join(dir, d), { recursive: true });
  }
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');

  const seedDate = date ?? new Date().toISOString().slice(0, 10);
  const seedName = `${prefix}-${seedDate}-PHI-001.md`;
  const seedPath = join(dir, 'papers', seedName);
  if (!existsSync(seedPath)) {
    writeFileSync(seedPath, FIRST_PAPER(prefix, seedDate, organisation), 'utf8');
  }

  return { configPath, seedPath, organisation, prefix };
}
