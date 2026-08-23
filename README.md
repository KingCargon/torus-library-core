# Torus Library

**A permanent memory for your company.**

GitHub remembers the code. Slack remembers conversations. Notion remembers
notes. Google Drive remembers files.

But what remembers *the company*?

---

We are creating more information than ever, and organisations are getting
worse at remembering why they made decisions. The code survives. The chat
logs survive. The reasoning evaporates — usually within a year, and usually
along with the people who held it.

Torus Library is the deliberate opposite. Every record is dated,
classified, rendered to PDF, hashed, and frozen. Nothing is edited in
place. When something changes, a new dated record either **amends** the
original or **supersedes** it, and what was previously believed is kept.

It is a chronicle, not a wiki.

```bash
npx torus-library init --organisation "Acme Corp" --prefix ACME
```

> **Status: Open Core · Early Access.** The engine is complete and tested.
> It is not a hosted service, and this is not a finished self-serve
> product. See [Project status](#project-status).

---

## Quick start

Requires **Node ≥ 20** and a **Chrome or Chromium binary** for PDF
rendering (see [Requirements](#requirements)).

```bash
npm install -g torus-library      # or use npx

torus-library init --organisation "Acme Corp" --prefix ACME
```

That writes a working configuration, the directory structure, and a first
paper to edit. Then:

```bash
torus-library validate papers/ACME-2026-01-15-PHI-001.md
```

Set `status: review` and add an approver when the text is right, then:

```bash
torus-library publish papers/ACME-2026-01-15-PHI-001.md
```

That freezes it. From then on the document can be amended or superseded,
but never quietly rewritten.

```bash
torus-library verify        # re-hash everything, prove nothing changed
torus-library site          # build a public website from public records
torus-library export --audience investor    # a portable handover package
```

## What you get

| Command | What it does |
| --- | --- |
| `init` | Create a library |
| `validate` | Check a document without writing anything |
| `publish` | Validate → PDF → hash → register → **freeze** |
| `verify` | Re-hash stored records; detect any tampering |
| `site` | Generate a static public website from public records only |
| `export` | Build a portable, self-verifying handover package |
| `diligence` | Map diligence categories to records, and report gaps |
| `index` / `chronicle` | Index repositories and generate dated entries |
| `check-refs` | Resolve cross-repository references |
| `verify-package` | Verify a received package against its own hashes |

## The ideas that matter

**Canon is frozen.** A published record is never edited. Corrections are
amendments or superseding revisions, and the earlier record is retained —
including the record of what was previously believed. That is the whole
product in one sentence.

**Audience classification fails closed.** Every record declares exactly one
audience. A record whose audience is missing, blank, misspelled, or not
configured is *refused*, never defaulted — and never assumed public. There
is one implementation of "is this public", and the website, the exports,
and the citation layer all use it.

**Two hashes, two meanings.** A source hash covers the frozen text and is
reproducible by anyone holding it. An artifact hash covers the exact
published PDF and is tamper-evidence for that file. The PDF hash is *not*
reproducible by re-rendering, because renderers embed timestamps — so we
say that plainly rather than claiming a guarantee that does not hold.

**It is not a secret store.** For material that must live elsewhere —
contracts, cap tables, incident records — the Library holds a *reference*:
what exists, who is custodian, which system holds it, how to request it.
Never the material, and never a credential. Attempting to record one is
refused. See [SECURITY.md](./SECURITY.md).

**You own it.** Markdown files, PDFs, and a JSON manifest on your own disk.
No database, no server, no runtime, no account. If this project vanished
tomorrow, your archive would still open in any text editor and any PDF
reader.

## Requirements

- **Node ≥ 20**
- **Chrome or Chromium**, for PDF rendering. It is discovered
  automatically in standard locations; otherwise set `pdf.binary` in your
  config or the `CHROMIUM_BINARY` environment variable. `npm install` does
  not provide it.

Four runtime dependencies, all permissively licensed: `markdown-it`,
`js-yaml`, `ajv`, `ajv-formats`.

## Project status

**Open Core · Early Access.**

What is true today: the engine is complete, has 146 tests, and runs
standalone with no service dependency. What is not true yet: there is no
hosted version, no web editor, no team workflow, and no self-serve
onboarding.

If you want the archive without running it yourself, that is what the
paid Torus offerings will eventually cover — managed hosting, automation,
integrations, team and diligence workflows, and implementation support.
The core is not crippled to sell them.

## Documentation

| Document | Contents |
| --- | --- |
| [Architecture](./docs/architecture.md) | How the pieces fit, and why |
| [Security model](./SECURITY.md) | Threat boundaries, and why this is not a secret store |
| [Open core](./docs/open-core.md) | What is open, what is not, and why |
| [Contributing](./CONTRIBUTING.md) | How to work on this |
| [Examples](./examples/) | A complete fictional library |

## Licence

**Not yet finalised.** This repository is being prepared for an open-core
release and the licence decision is pending. Until a `LICENSE` file is
present, no licence is granted. Please do not assume one — the absence of
a licence file means all rights are reserved.
