/**
 * Markdown -> HTML rendering, and the print stylesheet for PDF output.
 *
 * Presentation is instance-configurable (organisation name, imprint, footer
 * note) but carries no organisation-specific content of its own.
 */

import MarkdownIt from 'markdown-it';

const md = new MarkdownIt({ html: false, linkify: true, typographer: true });

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const STYLES = `
  @page { size: Letter; margin: 22mm 18mm 20mm 18mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Helvetica Neue", Arial, sans-serif;
         color: #1a2233; font-size: 10.5pt; line-height: 1.5; margin: 0; }
  .masthead { border-bottom: 2px solid #1a3c6e; padding-bottom: 8px; margin-bottom: 18px; }
  .masthead .org { font-size: 8.5pt; letter-spacing: 2px; text-transform: uppercase;
                   color: #1a3c6e; font-weight: 700; }
  h1 { color: #1a3c6e; font-size: 20pt; margin: 6px 0 4px; }
  h2 { color: #1a3c6e; font-size: 13pt; margin-top: 22px; border-bottom: 1px solid #cbd5e0;
       padding-bottom: 3px; page-break-after: avoid; }
  h3 { color: #1a3c6e; font-size: 11pt; margin-top: 16px; page-break-after: avoid; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0 16px; font-size: 9.5pt; }
  th { background: #1a3c6e; color: #fff; text-align: left; padding: 6px 8px; }
  td { padding: 5px 8px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  tr:nth-child(even) td { background: #f7fafc; }
  code { background: #edf2f7; padding: 1px 4px; border-radius: 3px; font-size: 9pt; }
  pre { background: #f7fafc; border: 1px solid #e2e8f0; border-radius: 4px;
        padding: 10px; overflow-x: auto; }
  pre code { background: none; padding: 0; }
  blockquote { border-left: 3px solid #cbd5e0; margin-left: 0; padding-left: 14px; color: #4a5568; }
  .meta { border: 1px solid #cbd5e0; border-radius: 6px; padding: 10px 14px;
          margin-bottom: 20px; font-size: 9pt; background: #f7fafc; }
  .meta dl { display: grid; grid-template-columns: max-content 1fr; gap: 3px 14px; margin: 0; }
  .meta dt { font-weight: 700; color: #4a5568; }
  .meta dd { margin: 0; }
  .audience { display: inline-block; font-weight: 700; text-transform: uppercase;
              font-size: 8pt; letter-spacing: 1px; padding: 2px 8px; border-radius: 3px;
              background: #1a3c6e; color: #fff; }
  .footer-note { margin-top: 28px; border-top: 1px solid #e2e8f0; padding-top: 6px;
                 font-size: 8pt; color: #a0aec0; }
`;

/**
 * Build the printable HTML for a paper.
 * @param {object} metadata validated front matter
 * @param {string} body markdown body
 * @param {object} config instance config
 */
export function renderHtml(metadata, body, config) {
  const org = config.organisation?.name ?? '';
  const imprint = config.organisation?.imprint ?? '';
  const footer = config.pdf?.footer_note ?? '';

  const rows = [
    ['ID', metadata.id],
    ['Date', metadata.date],
    ['Status', metadata.status],
    ['Authors', (metadata.authors ?? []).join(', ')],
  ];
  if (metadata.approvers?.length) rows.push(['Approvers', metadata.approvers.join(', ')]);
  if (metadata.supersedes) rows.push(['Supersedes', metadata.supersedes]);
  if (metadata.amends) rows.push(['Amends', metadata.amends]);
  if (metadata.licence_or_confidentiality) {
    rows.push(['Classification', metadata.licence_or_confidentiality]);
  }

  const dl = rows
    .map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`)
    .join('\n      ');

  return `<!doctype html>
<html><head><meta charset="utf-8">
<title>${escapeHtml(metadata.title)}</title>
<style>${STYLES}</style>
</head><body>
  <div class="masthead">
    <div class="org">${escapeHtml(org)}${imprint ? ` &middot; ${escapeHtml(imprint)}` : ''}</div>
    <h1>${escapeHtml(metadata.title)}</h1>
  </div>
  <div class="meta">
    <dl>
      ${dl}
      <dt>Audience</dt><dd><span class="audience">${escapeHtml(metadata.audience)}</span></dd>
    </dl>
  </div>
  ${md.render(body)}
  ${footer ? `<div class="footer-note">${escapeHtml(footer)}</div>` : ''}
</body></html>
`;
}
