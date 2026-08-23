# Architecture

## The pipeline

```
papers/x.md
   ↓  front matter parsed
   ↓  metadata validated       (schema + semantic rules)
   ↓  canon freeze checked     ← before any write
   ↓  approval state checked
   ↓  relationships checked    (supersedes / amends)
   ↓  HTML rendered → PDF written
   ↓  SHA-256 × 2  (source, artifact)
   ↓  canon/ written, manifest updated atomically
FROZEN
```

The freeze check runs **before** rendering or writing, so a frozen record
cannot be even partially rewritten by a failed republish.

## Modules

| Module | Responsibility |
| --- | --- |
| `config.js` | Instance configuration — everything organisation-specific arrives here |
| `identity.js` | Identifier rules; shape fixed, prefix and type codes configurable |
| `audience.js` | The publication boundary. Fails closed |
| `metadata.js` | Schema validation plus rules a schema cannot express |
| `frontmatter.js` | YAML front matter, with dates normalised |
| `render.js` / `pdf.js` | Markdown → HTML → PDF; renderer behind one adapter |
| `hash.js` | SHA-256 over source and artifact |
| `manifest.js` | The register; atomic writes |
| `publish.js` | Pipeline, freeze, amend, supersede, verify |
| `site/` | Static public site, through the same audience gate |
| `diligence/` | References, secret refusal, diligence index, exports |
| `data/` | The optional citation contract |
| `init/` | Scaffolding a new library |

## Two properties worth understanding

**One definition of "public."** The public site has no content loader of
its own. It projects the same predicate that governs exports. A second
implementation is how an archive eventually serves something it should
have refused.

**The citation contract is optional.** Nothing in the publishing pipeline
imports it — asserted by test. The Library is fully functional with no
measurement system present, which is the state it was built and tested in.

## Portability

No database. No server. No runtime. Records are Markdown and PDF; the
register is JSON. Everything organisation-specific is configuration.

The one external requirement is a Chrome/Chromium binary for PDF
rendering, discovered at run time rather than compiled in.
