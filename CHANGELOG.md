# Changelog

## [Unreleased] — open-core release candidate

First public preparation of the Torus Library engine.

### Added
- `init` — create a library from nothing, with a seeded first paper.
- Publishing pipeline: Markdown → metadata validation → approval → PDF →
  dual SHA-256 → manifest → canon freeze.
- Amendments and superseding revisions; a paper in force may be revised.
- Integrity verification over stored records.
- Repository indexing and generated chronicle entries.
- Static public site generation, through the same audience gate as
  publishing.
- Diligence index with explicit gap reporting.
- Restricted references, with prohibited-secret refusal.
- Audience-scoped exports as portable, self-verifying packages.
- A versioned Library ↔ measurement-system citation contract, optional by
  design.

### Notes
- 146 tests.
- Four runtime dependencies, all permissively licensed.
- Licensed under Apache-2.0.
