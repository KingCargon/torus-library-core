/**
 * Precision Light — the Torus visual identity, inherited from
 * torus-factory v1.0.0 (ADR-0008).
 *
 * Values are copied verbatim from `torus-factory/app/globals.css` rather
 * than re-derived, so the two surfaces cannot drift apart. Light-first
 * only: torus-factory forbids dark mode with a test that fails the build
 * if a dark variant reappears, and a public archive that inverts against
 * its sibling site would read as a different company.
 *
 * Elevation comes from hairline borders and rings. torus-factory defines
 * no shadow tokens; neither does this.
 */

export const CSS = `
:root {
  --background: #f4f5f6;
  --foreground: #111315;
  --card: #ffffff;
  --primary: oklch(0.52 0.2 27.325);
  --primary-foreground: #ffffff;
  --secondary: #eaedf0;
  --muted: #eaedf0;
  --muted-foreground: #5f666d;
  --border: #d5dade;
  --border-strong: #b9c0c6;
  --radius: 0.4rem;
  --contrast-surface: #15181b;
  --contrast-foreground: #f4f5f6;
  --contrast-muted-foreground: #9aa1a8;
  --contrast-border: rgb(244 245 246 / 12%);
  --grid-line: rgb(17 19 21 / 4.5%);

  --font-sans: Geist, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  --font-mono: "Geist Mono", ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
}

*, *::before, *::after { box-sizing: border-box; }

html { -webkit-text-size-adjust: 100%; }

body {
  margin: 0;
  overflow-wrap: break-word;
  background: var(--background);
  color: var(--foreground);
  font-family: var(--font-sans);
  font-size: 16px;
  line-height: 1.65;
  -webkit-font-smoothing: antialiased;
}

/* Focus visibility is a hard requirement, not a nicety. */
a:focus-visible, button:focus-visible, summary:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
  border-radius: 2px;
}

.skip-link {
  position: absolute; left: -9999px; top: 0; z-index: 100;
  background: var(--primary); color: var(--primary-foreground);
  padding: 0.6rem 1rem; border-radius: 0 0 var(--radius) 0;
}
.skip-link:focus { left: 0; }

.container { max-width: 80rem; margin: 0 auto; padding: 0 1rem; }
@media (min-width: 640px) { .container { padding: 0 1.5rem; } }
@media (min-width: 1024px) { .container { padding: 0 2rem; } }
.measure { max-width: min(42rem, 100%); }

/* ---- header ---- */
.site-header {
  position: sticky; top: 0; z-index: 50;
  border-bottom: 1px solid var(--border);
  background: color-mix(in srgb, var(--background) 85%, transparent);
  backdrop-filter: blur(12px);
}
.site-header .bar { display: flex; align-items: center; justify-content: space-between; height: 4rem; gap: 1rem; }
.brand { display: flex; align-items: baseline; gap: 0.5rem; text-decoration: none; color: inherit; }
.brand .mark { font-family: var(--font-mono); font-size: 0.875rem; letter-spacing: 0.08em; text-transform: uppercase; font-weight: 600; }
.brand .imprint { font-family: var(--font-mono); font-size: 0.6875rem; letter-spacing: 0.2em; text-transform: uppercase; color: var(--muted-foreground); }
.site-nav { display: flex; gap: 1.25rem; flex-wrap: wrap; }
.site-nav a {
  font-family: var(--font-mono); font-size: 0.6875rem; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--muted-foreground); text-decoration: none;
}
.site-nav a:hover, .site-nav a[aria-current="page"] { color: var(--foreground); }

/* ---- page furniture ---- */
main { display: block; }
.section { padding-block: 3rem; }
@media (min-width: 640px) { .section { padding-block: 4rem; } }
/* The masthead already carries generous space; avoid stacking two full rhythms. */
.masthead .section { padding-block: 2.75rem 2.75rem; }
.masthead + .container.section { padding-block-start: 2.5rem; }

.eyebrow {
  font-family: var(--font-mono); font-size: 0.75rem; letter-spacing: 0.2em;
  text-transform: uppercase; color: var(--muted-foreground); margin: 0 0 0.75rem;
}
h1 { font-size: 1.875rem; line-height: 1.15; letter-spacing: -0.02em; font-weight: 600; margin: 0 0 0.5rem; }
@media (min-width: 640px) { h1 { font-size: 2.25rem; } }
h2 { font-size: 1.25rem; letter-spacing: -0.01em; font-weight: 600; margin: 2.5rem 0 0.75rem; }
h3 { font-size: 1.0625rem; font-weight: 600; margin: 2rem 0 0.5rem; }
.lede { color: var(--muted-foreground); font-size: 1.0625rem; margin: 0 0 1.5rem; }

a { color: var(--foreground); text-underline-offset: 3px; text-decoration-color: var(--border-strong); }
a:hover { text-decoration-color: var(--primary); }

/* ---- hairline grid banner (torus-factory idiom) ---- */
.masthead {
  border-bottom: 1px solid var(--border);
  background-image: linear-gradient(var(--grid-line) 1px, transparent 1px),
                    linear-gradient(90deg, var(--grid-line) 1px, transparent 1px);
  background-size: 48px 48px;
}

/* ---- cards / list rows ---- */
.grid { display: grid; gap: 1rem; }
@media (min-width: 768px) { .grid.cols-2 { grid-template-columns: 1fr 1fr; } }
@media (min-width: 1024px) { .grid.cols-3 { grid-template-columns: repeat(3, 1fr); } }

.card {
  background: var(--card); border: 1px solid var(--border);
  border-radius: calc(var(--radius) * 1.4); padding: 1.25rem;
}
.card h3 { margin-top: 0; }
.card p { margin: 0.5rem 0 0; color: var(--muted-foreground); font-size: 0.9375rem; }

.rows { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--border); }
.rows li { border-bottom: 1px solid var(--border); }
.rows a.row { display: block; padding: 1.1rem 0.25rem; text-decoration: none; }
.rows a.row:hover { background: var(--secondary); }
.rows .row-title { font-weight: 600; margin: 0 0 0.35rem; }
.rows .row-meta { display: flex; flex-wrap: wrap; gap: 0.5rem 1rem; align-items: center; }

/* ---- mono metadata + badges ---- */
.mono, .doc-id, time { font-family: var(--font-mono); font-size: 0.75rem; letter-spacing: 0.04em; color: var(--muted-foreground); }
.badge {
  display: inline-flex; align-items: center; gap: 0.4rem;
  border: 1px solid var(--border); border-radius: var(--radius);
  padding: 0.15rem 0.5rem;
  font-family: var(--font-mono); font-size: 0.6875rem; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--muted-foreground);
}
.badge .dot { width: 0.375rem; height: 0.375rem; border-radius: 999px; background: var(--muted-foreground); }
.badge.is-canon { color: var(--foreground); border-color: var(--border-strong); }
.badge.is-canon .dot { background: var(--primary); }

/* ---- document body ---- */
.doc-meta {
  border: 1px solid var(--border); border-radius: calc(var(--radius) * 1.4);
  background: var(--card); padding: 1rem 1.25rem; margin: 0 0 2rem;
}
.doc-meta dl { display: grid; grid-template-columns: 1fr; gap: 0.15rem 1.25rem; margin: 0; }
@media (min-width: 480px) { .doc-meta dl { grid-template-columns: max-content 1fr; gap: 0.35rem 1.25rem; } }
.doc-meta dd + dt { margin-top: 0.5rem; }
@media (min-width: 480px) { .doc-meta dd + dt { margin-top: 0; } }
.doc-meta dt { font-family: var(--font-mono); font-size: 0.6875rem; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted-foreground); }
.doc-meta dd { margin: 0; font-size: 0.875rem; }
.doc-meta dd.hash { font-family: var(--font-mono); font-size: 0.6875rem; word-break: break-all; }

.prose { max-width: min(42rem, 100%); }
.prose h2 { border-bottom: 1px solid var(--border); padding-bottom: 0.35rem; }
.prose table { width: 100%; border-collapse: collapse; margin: 1.25rem 0; font-size: 0.9375rem; display: block; overflow-x: auto; }
.prose th { text-align: left; border-bottom: 1px solid var(--border-strong); padding: 0.5rem 0.75rem 0.5rem 0; font-size: 0.75rem; letter-spacing: 0.08em; text-transform: uppercase; font-family: var(--font-mono); color: var(--muted-foreground); }
.prose td { border-bottom: 1px solid var(--border); padding: 0.6rem 0.75rem 0.6rem 0; vertical-align: top; }
.prose code { font-family: var(--font-mono); font-size: 0.85em; background: var(--secondary); padding: 0.1rem 0.3rem; border-radius: 3px; }
.prose pre { background: var(--secondary); border: 1px solid var(--border); border-radius: var(--radius); padding: 0.9rem 1rem; overflow-x: auto; }
.prose pre code { background: none; padding: 0; }
.prose blockquote { margin: 1.25rem 0; padding-left: 1rem; border-left: 2px solid var(--border-strong); color: var(--muted-foreground); }
.prose img { max-width: 100%; height: auto; }

.actions { display: flex; flex-wrap: wrap; gap: 0.75rem; margin: 1.5rem 0 0; }
.btn {
  display: inline-flex; align-items: center; gap: 0.5rem;
  border: 1px solid var(--border-strong); border-radius: var(--radius);
  padding: 0.45rem 0.85rem; text-decoration: none; background: var(--card);
  font-size: 0.875rem;
}
.btn:hover { border-color: var(--primary); }
.btn-primary { background: var(--primary); color: var(--primary-foreground); border-color: transparent; }

.empty {
  border: 1px dashed var(--border-strong); border-radius: calc(var(--radius) * 1.4);
  padding: 1.5rem; color: var(--muted-foreground); background: var(--card);
}

/* ---- footer: the one deliberate dark surface ---- */
.site-footer {
  background: var(--contrast-surface); color: var(--contrast-foreground);
  border-top: 1px solid var(--contrast-border); margin-top: 4rem; padding: 2.5rem 0;
}
.site-footer a { color: var(--contrast-foreground); }
.site-footer .note { color: var(--contrast-muted-foreground); font-size: 0.8125rem; max-width: min(42rem, 100%); }
.site-footer .mono { color: var(--contrast-muted-foreground); }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
`;
