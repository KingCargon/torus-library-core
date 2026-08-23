/**
 * HTML templates for the public Library.
 *
 * Plain semantic HTML. No client-side JavaScript is required to read
 * anything on the site — an institutional archive should render in a text
 * browser in a decade's time.
 */

import MarkdownIt from 'markdown-it';

const md = new MarkdownIt({ html: false, linkify: true, typographer: true });

export function esc(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function renderMarkdown(body) {
  return md.render(body ?? '');
}

/** ISO date -> "18 August 2026", with a machine-readable datetime. */
export function dateHtml(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  const human = Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  return `<time datetime="${esc(iso)}">${esc(human)}</time>`;
}

const NAV = [
  ['/', 'Home'],
  ['/papers/', 'Papers'],
  ['/chronicle/', 'Chronicle'],
  ['/verify/', 'Verify'],
];

/**
 * @param {object} o
 * @param {string} o.title      page <title>, without the site suffix
 * @param {string} o.description meta description
 * @param {string} o.path       current path, for nav highlighting + canonical URL
 * @param {string} o.body       page HTML
 * @param {object} o.site       { name, imprint, baseUrl }
 * @param {string} [o.structuredData] JSON-LD, already stringified
 */
export function page({ title, description, path, body, site, structuredData = null }) {
  const fullTitle = path === '/' ? `${site.imprint} — ${site.name}` : `${title} — ${site.imprint}`;
  const canonical = site.baseUrl ? `${site.baseUrl}${path}` : null;

  const nav = NAV.map(([href, label]) => {
    const current = href === path || (href !== '/' && path.startsWith(href));
    return `<a href="${href}"${current ? ' aria-current="page"' : ''}>${esc(label)}</a>`;
  }).join('\n          ');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description)}">
${canonical ? `<link rel="canonical" href="${esc(canonical)}">` : ''}
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(fullTitle)}">
<meta property="og:description" content="${esc(description)}">
${canonical ? `<meta property="og:url" content="${esc(canonical)}">` : ''}
<meta property="og:site_name" content="${esc(site.imprint)}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${esc(fullTitle)}">
<meta name="twitter:description" content="${esc(description)}">
<link rel="stylesheet" href="/styles.css">
${structuredData ? `<script type="application/ld+json">${structuredData}</script>` : ''}
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>
<header class="site-header">
  <div class="container">
    <div class="bar">
      <a class="brand" href="/">
        <span class="mark">${esc(site.name)}</span>
        <span class="imprint">${esc(site.imprint)}</span>
      </a>
      <nav class="site-nav" aria-label="Primary">
          ${nav}
      </nav>
    </div>
  </div>
</header>
<main id="main">
${body}
</main>
<footer class="site-footer">
  <div class="container">
    <p class="mono">${esc(site.imprint)} · ${esc(site.name)}</p>
    <p class="note">
      This is the public face of an institutional archive. Every document
      shown here is frozen canon: published on a stated date, hashed, and
      never silently rewritten. Corrections appear as amendments or
      superseding revisions, and the record of what was previously believed
      is kept.
    </p>
    <p class="note">
      Only documents explicitly classified as public appear here. Internal,
      investor, and restricted material is not part of this site and is not
      served from it.
    </p>
  </div>
</footer>
</body>
</html>
`;
}

export function statusBadge(entry) {
  const cls = entry.status === 'canon' ? 'badge is-canon' : 'badge';
  return `<span class="${cls}"><span class="dot" aria-hidden="true"></span>${esc(entry.status)}</span>`;
}

/** One row in a document list. */
export function paperRow(entry, typeLabel) {
  return `<li>
  <a class="row" href="/papers/${esc(entry.id)}/">
    <p class="row-title">${esc(entry.title)}</p>
    <span class="row-meta">
      <span class="doc-id">${esc(entry.id)}</span>
      ${dateHtml(entry.date)}
      ${typeLabel ? `<span class="mono">${esc(typeLabel)}</span>` : ''}
      ${statusBadge(entry)}
    </span>
  </a>
</li>`;
}
