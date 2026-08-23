/**
 * Static site generation for the public Library.
 *
 * THE SAFETY PROPERTY (ADR-0008): a document reaches this site only by
 * passing `isPubliclyReleasable` — the same predicate `exportPublic` uses.
 * There is no second definition of "public" anywhere in this file, and no
 * filter that could drift from the gate.
 *
 * Selection is additionally gated on `status === 'canon'`: a draft is by
 * definition unapproved, so even a draft marked `audience: public` is
 * excluded. Both conditions must hold. Neither has a default.
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { isPubliclyReleasable } from '../audience.js';
import * as manifestStore from '../manifest.js';
import * as frontmatter from '../frontmatter.js';
import { LibraryError, codes } from '../errors.js';
import { CSS } from './styles.js';
import { dateHtml, esc, page, paperRow, renderMarkdown, statusBadge } from './templates.js';

/**
 * The gate. Exported so tests can assert on it directly, and so there is
 * exactly one place to read if someone asks "what reaches the public site?"
 *
 * A document is eligible if and only if:
 *   1. it is frozen canon, and
 *   2. its audience is provably the configured public audience.
 *
 * Everything else — drafts, review, superseded, amended, internal,
 * investor, restricted, missing audience, misspelled audience, and any
 * audience when no public tier is configured — is excluded.
 */
export function isEligible(entry, config) {
  if (!entry || typeof entry !== 'object') return false;
  if (entry.status !== 'canon') return false;
  return isPubliclyReleasable(entry, config);
}

function write(outDir, relPath, contents) {
  const target = join(outDir, relPath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, contents, 'utf8');
  return target;
}

function typeLabelFor(entry, config) {
  const m = /^[A-Z][A-Z0-9]{1,7}-\d{4}-\d{2}-\d{2}-([A-Z]{3})-\d{3}$/.exec(entry.id);
  return m ? (config.type_codes?.[m[1]] ?? m[1]) : null;
}

function typeCodeFor(entry) {
  const m = /-([A-Z]{3})-\d{3}$/.exec(entry.id);
  return m ? m[1] : null;
}

/* ------------------------------------------------------------------ */
/* pages                                                               */
/* ------------------------------------------------------------------ */

function homePage(eligible, config, site) {
  const recent = eligible.slice(0, 5);
  const classes = [...new Set(eligible.map((e) => typeLabelFor(e, config)).filter(Boolean))];

  const body = `
<div class="masthead">
  <div class="container section">
    <p class="eyebrow">${esc(site.imprint)}</p>
    <h1>The institutional record of ${esc(site.name)}</h1>
    <p class="lede measure">
      A dated, PDF-backed archive of the rules, decisions, and standards behind
      how this company is built. Every document here is frozen: published on a
      stated date, hashed, and never silently rewritten.
    </p>
  </div>
</div>

<div class="container section">
  <h2 id="what">What this is</h2>
  <div class="measure">
    <p>
      This is a chronicle, not a wiki. Pages are not edited in place. When
      something changes, a new dated document either <strong>amends</strong>
      the original or <strong>supersedes</strong> it, and the earlier record is
      kept — including the record of what was previously believed.
    </p>
    <p>
      Each published document carries two SHA-256 hashes with distinct
      meanings: one over its source text, which is reproducible, and one over
      the exact PDF that was published, which is tamper-evidence for that file.
      <a href="/verify/">How verification works</a>.
    </p>
  </div>

  <h2 id="published">Published records</h2>
  ${recent.length === 0
    ? `<div class="empty">No public records have been published yet.</div>`
    : `<ul class="rows">${recent.map((e) => paperRow(e, typeLabelFor(e, config))).join('\n')}</ul>
       <div class="actions"><a class="btn" href="/papers/">All papers (${eligible.length})</a></div>`}

  ${classes.length
    ? `<h2 id="classes">Document classes</h2>
       <div class="grid cols-3">
         ${classes.map((c) => `<div class="card"><h3>${esc(c)}</h3><p>${eligible.filter((e) => typeLabelFor(e, config) === c).length} published</p></div>`).join('\n')}
       </div>`
    : ''}
</div>`;

  return page({
    title: 'Home',
    description: `The public institutional archive of ${site.name}. Dated, hashed, PDF-backed records of decisions, standards, and history.`,
    path: '/',
    body,
    site,
    structuredData: JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: `${site.imprint} — ${site.name}`,
      description: `The public institutional archive of ${site.name}.`,
      ...(site.baseUrl ? { url: site.baseUrl } : {}),
    }),
  });
}

function indexPage(eligible, config, site) {
  const body = `
<div class="container section">
  <p class="eyebrow">Index</p>
  <h1>Papers</h1>
  <p class="lede measure">Every publicly published record, newest first.</p>
  ${eligible.length === 0
    ? `<div class="empty">No public records have been published yet.</div>`
    : `<ul class="rows">${eligible.map((e) => paperRow(e, typeLabelFor(e, config))).join('\n')}</ul>`}
</div>`;
  return page({
    title: 'Papers',
    description: `Index of publicly published records in the ${site.name} archive.`,
    path: '/papers/',
    body,
    site,
  });
}

function documentPage(entry, config, site, byId) {
  const canonPath = join(config.baseDir, entry.markdown);
  const { metadata, body: markdownBody } = frontmatter.parse(readFileSync(canonPath, 'utf8'), entry.id);

  const supersedes = entry.supersedes && byId.has(entry.supersedes)
    ? `<a href="/papers/${esc(entry.supersedes)}/">${esc(entry.supersedes)}</a>`
    : entry.supersedes ? `<span class="mono">${esc(entry.supersedes)}</span>` : null;

  const supersededBy = entry.superseded_by && byId.has(entry.superseded_by)
    ? `<a href="/papers/${esc(entry.superseded_by)}/">${esc(entry.superseded_by)}</a>`
    : entry.superseded_by ? `<span class="mono">${esc(entry.superseded_by)}</span>` : null;

  const amendedBy = (entry.amended_by ?? [])
    .map((id) => (byId.has(id) ? `<a href="/papers/${esc(id)}/">${esc(id)}</a>` : `<span class="mono">${esc(id)}</span>`))
    .join(', ');

  const rows = [
    ['Library ID', `<span class="doc-id">${esc(entry.id)}</span>`],
    ['Published', dateHtml(entry.date)],
    ['Status', statusBadge(entry)],
    ['Authors', esc((metadata.authors ?? []).join(', '))],
  ];
  if (supersedes) rows.push(['Supersedes', supersedes]);
  if (supersededBy) rows.push(['Superseded by', supersededBy]);
  if (amendedBy) rows.push(['Amended by', amendedBy]);

  const pdfName = basename(entry.pdf);
  const body = `
<div class="container section">
  <p class="eyebrow">${esc(typeLabelFor(entry, config) ?? 'Record')}</p>
  <h1>${esc(entry.title)}</h1>

  <div class="doc-meta measure">
    <dl>
      ${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('\n      ')}
    </dl>
  </div>

  <div class="actions">
    <a class="btn btn-primary" href="/papers/${esc(entry.id)}/${esc(pdfName)}">Download PDF</a>
    <a class="btn" href="#integrity">Integrity</a>
  </div>

  <article class="prose">
${renderMarkdown(markdownBody)}
  </article>

  <h2 id="integrity">Integrity</h2>
  <div class="doc-meta measure">
    <dl>
      <dt>Source SHA-256</dt><dd class="hash">${esc(entry.source_sha256)}</dd>
      <dt>PDF SHA-256</dt><dd class="hash">${esc(entry.pdf_sha256)}</dd>
      <dt>Frozen at</dt><dd class="mono">${esc(entry.frozen_at)}</dd>
    </dl>
  </div>
  <p class="measure" style="color:var(--muted-foreground);font-size:0.9375rem">
    The source hash covers this document's text and is reproducible by anyone
    holding the source. The PDF hash covers the exact published file and is
    tamper-evidence for it — it is not reproducible by re-rendering, because
    the renderer embeds generation timestamps.
    <a href="/verify/">How to check these</a>.
  </p>
</div>`;

  return page({
    title: entry.title,
    description: `${entry.title} — ${entry.id}, published ${entry.date} in the ${site.name} archive.`,
    path: `/papers/${entry.id}/`,
    body,
    site,
    structuredData: JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: entry.title,
      datePublished: entry.date,
      identifier: entry.id,
      author: (metadata.authors ?? []).map((n) => ({ '@type': 'Organization', name: n })),
      publisher: { '@type': 'Organization', name: site.name },
      ...(site.baseUrl ? { url: `${site.baseUrl}/papers/${entry.id}/` } : {}),
    }),
  });
}

function chroniclePage(eligible, config, site) {
  const chronicle = eligible.filter((e) => typeCodeFor(e) === 'CHR');

  const body = `
<div class="container section">
  <p class="eyebrow">Chronology</p>
  <h1>Chronicle</h1>
  <p class="lede measure">
    Dated entries recording what existed, and when.
  </p>
  ${chronicle.length === 0
    ? `<div class="empty measure">
         <p style="margin-top:0"><strong>No chronicle entries are public yet.</strong></p>
         <p style="margin-bottom:0">
           The chronicle exists and is maintained, but its current entries are
           classified internal because they record repository state, branch
           names, and commit identifiers for private repositories. They are not
           published here, and this page will stay empty until entries exist
           that are appropriate to publish.
         </p>
       </div>`
    : `<ul class="rows">${chronicle.map((e) => paperRow(e, null)).join('\n')}</ul>`}
</div>`;

  return page({
    title: 'Chronicle',
    description: `Public chronology of the ${site.name} archive.`,
    path: '/chronicle/',
    body,
    site,
  });
}

function verifyPage(eligible, site) {
  const example = eligible[0];
  const body = `
<div class="container section">
  <p class="eyebrow">Provenance</p>
  <h1>Verifying a document</h1>
  <div class="measure">
    <p class="lede">
      Every published document carries two hashes, and they prove different
      things. Both are printed on the document's page.
    </p>

    <h2>Source hash — reproducible</h2>
    <p>
      A SHA-256 over the document's frozen source text. Anyone holding that
      source can recompute it and get the same value. This proves the text has
      not changed since it was published.
    </p>

    <h2>PDF hash — tamper-evidence</h2>
    <p>
      A SHA-256 over the exact PDF file that was published. Download the PDF
      and hash it; the value should match the one shown on the page:
    </p>
    <pre><code>shasum -a 256 ${esc(example ? basename(example.pdf) : 'document.pdf')}</code></pre>
    <p>
      This hash is <strong>not</strong> reproducible by regenerating the PDF
      from source. The renderer embeds generation timestamps, so a fresh render
      produces different bytes and a different digest. Saying otherwise would
      be an integrity claim that does not hold, so it is not claimed here.
    </p>

    <h2>What a mismatch means</h2>
    <p>
      If a downloaded PDF does not match its published hash, the file you have
      is not the file that was published. If a source hash does not match, the
      text has been altered since freezing.
    </p>

    <h2>Why documents are never edited</h2>
    <p>
      Published records are frozen. A correction is issued as an
      <strong>amendment</strong> — a new dated document attached to the
      original — or as a <strong>superseding revision</strong>, which replaces
      it while the original is retained and marked superseded. Nothing is
      deleted, and nothing is quietly rewritten.
    </p>
  </div>
</div>`;

  return page({
    title: 'Verify',
    description: `How to verify the integrity and provenance of documents in the ${site.name} archive.`,
    path: '/verify/',
    body,
    site,
  });
}

/* ------------------------------------------------------------------ */
/* orchestrator                                                        */
/* ------------------------------------------------------------------ */

/**
 * Generate the public site.
 *
 * @param {object} config loaded instance config
 * @param {object} [options]
 * @param {string} [options.outDir]  defaults to <baseDir>/public-site
 * @param {string} [options.baseUrl] absolute site URL, for canonical/sitemap
 * @returns {{outDir:string, published:string[], excluded:Array, files:string[]}}
 */
export function generateSite(config, { outDir, baseUrl = null } = {}) {
  const out = outDir ?? join(config.baseDir, 'public-site');
  const manifest = manifestStore.load(config);
  const all = Object.values(manifest.entries);

  const eligible = [];
  const excluded = [];
  for (const entry of all) {
    if (isEligible(entry, config)) eligible.push(entry);
    else {
      excluded.push({
        id: entry.id,
        reason: entry.status !== 'canon' ? `status is '${entry.status}', not canon` : `audience '${entry.audience}' is not public`,
      });
    }
  }

  eligible.sort((a, b) => (a.date === b.date ? (a.id < b.id ? 1 : -1) : a.date < b.date ? 1 : -1));
  const byId = new Set(eligible.map((e) => e.id));

  const site = {
    name: config.organisation?.name ?? 'Library',
    imprint: config.organisation?.imprint ?? 'Library',
    baseUrl: baseUrl ? baseUrl.replace(/\/$/, '') : null,
  };

  const files = [];
  files.push(write(out, 'styles.css', CSS));
  files.push(write(out, 'index.html', homePage(eligible, config, site)));
  files.push(write(out, 'papers/index.html', indexPage(eligible, config, site)));
  files.push(write(out, 'chronicle/index.html', chroniclePage(eligible, config, site)));
  files.push(write(out, 'verify/index.html', verifyPage(eligible, site)));

  for (const entry of eligible) {
    files.push(write(out, `papers/${entry.id}/index.html`, documentPage(entry, config, site, byId)));

    const srcPdf = join(config.baseDir, entry.pdf);
    if (!existsSync(srcPdf)) {
      throw new LibraryError(
        codes.CANON_MISSING,
        `Cannot publish '${entry.id}': its PDF is missing at ${entry.pdf}. Refusing to publish a record whose artifact cannot be served.`,
        { id: entry.id },
      );
    }
    const destPdf = join(out, 'papers', entry.id, basename(entry.pdf));
    mkdirSync(dirname(destPdf), { recursive: true });
    copyFileSync(srcPdf, destPdf);
    files.push(destPdf);
  }

  // robots + sitemap. Without a base URL a sitemap would contain relative
  // entries, which is worse than none, so it is skipped rather than faked.
  const robots = site.baseUrl
    ? `User-agent: *\nAllow: /\n\nSitemap: ${site.baseUrl}/sitemap.xml\n`
    : `User-agent: *\nAllow: /\n`;
  files.push(write(out, 'robots.txt', robots));

  if (site.baseUrl) {
    const urls = ['/', '/papers/', '/chronicle/', '/verify/', ...eligible.map((e) => `/papers/${e.id}/`)];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${site.baseUrl}${u}</loc></url>`).join('\n')}
</urlset>
`;
    files.push(write(out, 'sitemap.xml', xml));
  }

  return { outDir: out, published: eligible.map((e) => e.id), excluded, files };
}
