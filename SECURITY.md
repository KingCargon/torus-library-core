# Security model

## Torus Library is not a secret store

This is the most important thing to understand before using it.

The Library records **meaning**: decisions, policies, history, and the
proof behind them. For material that is genuinely sensitive — contracts,
cap tables, incident records, anything under legal or financial
confidentiality — it holds a **reference**, not the material:

- what the artifact is
- who the custodian is
- which system holds it
- how to request access
- optionally, a custodian-supplied fingerprint identifying which version
  was referenced

It never holds the artifact, and it never holds a credential for reaching
one. Attempting to record one is refused: every field of every reference
is scanned for private keys, cloud access keys, API tokens, JWTs, bearer
headers, connection strings with inline passwords, and credential-shaped
assignments. A pre-authenticated or signed URL is rejected specifically —
it is an access grant wearing a locator's clothes.

**Why the refusal is strict.** Published records are frozen and hashed. A
credential written into one could not be edited out. It would have to be
superseded while the original remained in the archive permanently, and any
export already handed to someone would still carry it. A false positive
costs an author thirty seconds; a false negative is unrecoverable.

**Stated limit.** Pattern matching cannot catch every secret. This is a
guardrail against mistakes, not a defence against a determined author. The
real protection is the architecture: there is no reason to paste a
credential here, because the Library never needs one.

## The audience boundary

Every record declares exactly one audience. There is **one**
implementation of "is this publicly releasable", and the public website,
exports, and citation layer all use it.

It fails closed at every step:

- a missing audience is an error, never a default
- a blank or whitespace audience is an error
- an unrecognised audience — including a misspelling like `pubic` or a
  wrong case like `PUBLIC` — is an error
- if no public tier is configured, **nothing** is publishable
- a draft marked public is still excluded; approval is required
- a superseded record is withdrawn from public output

**There is no inheritance.** Exporting for one audience returns exactly
that audience. Widening requires naming each additional audience
explicitly, so it is visible in the calling code and in the export log.

## No network surface

The engine opens no socket and serves nothing. There is no server, no
authentication, no session handling, and no network route to non-public
material. Exports are files; delivery happens outside the Library through
whatever controlled mechanism the situation warrants.

This is enforced by test: the diligence modules are asserted to contain no
HTTP, socket, or fetch usage, so a serving path cannot appear by accident.

## What integrity hashes do and do not prove

| Hash | Proves | Reproducible |
| --- | --- | --- |
| Source | the frozen text is unchanged | Yes — recompute from the source |
| Artifact | that exact PDF is unaltered | Against the stored file |

The artifact hash is **not** reproducible by re-rendering. PDF renderers
embed generation timestamps, so a fresh render produces different bytes.
Claiming otherwise would be an integrity guarantee that does not hold, so
it is not claimed.

## Threats this does not address

- A malicious author with write access. The Library records what it is
  given; it does not adjudicate truth.
- Storage compromise. Use your own disk, backup, and access controls.
- Custodian systems. Material referenced from elsewhere is protected by
  whoever holds it, not by this.

## Reporting a vulnerability

Please report privately rather than opening a public issue. Contact
details will accompany the public release.
