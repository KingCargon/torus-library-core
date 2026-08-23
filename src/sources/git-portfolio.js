/**
 * Source adapter: collect portfolio records from a git host plus local clones.
 *
 * This is the ONLY module that shells out. It is deliberately separated
 * from `portfolio.js` (which is pure) for the same reason the PDF renderer
 * sits behind an adapter: the collection mechanism is the part most likely
 * to change — a different host, an API token instead of a CLI, a
 * pre-exported JSON file — and swapping it must not touch the index logic.
 *
 * Worktree resolution is the load-bearing detail. Under `git`, a worktree's
 * `.git` is a FILE pointing at its parent, while a real clone's `.git` is a
 * DIRECTORY. That distinction is mechanical, which is what lets the
 * canonical-identity rule be enforced rather than merely asserted.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';

function run(cmd, args, cwd) {
  try {
    return execFileSync(cmd, args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 60_000,
    }).trim();
  } catch {
    return null;
  }
}

/** `owner/name` from any remote URL form (https, ssh, with or without .git). */
export function identityFromRemote(url) {
  if (!url) return null;
  const m = /(?:[:/])([^/:]+)\/([^/]+?)(?:\.git)?$/.exec(url.trim());
  if (!m) return null;
  return { owner: m[1], name: m[2] };
}

/** True when `dir` is a git worktree rather than a standalone clone. */
export function isWorktree(dir) {
  const dotGit = join(dir, '.git');
  return existsSync(dotGit) && statSync(dotGit).isFile();
}

/** Enumerate repositories on the host via the GitHub CLI. */
export function listRemoteRepositories({ owner, limit = 200 } = {}) {
  const out = run('gh', [
    'repo', 'list', owner,
    '--limit', String(limit),
    '--json', 'name,owner,visibility,description,updatedAt',
  ]);
  if (!out) return [];
  try {
    return JSON.parse(out).map((r) => ({
      owner: r.owner?.login ?? owner,
      name: r.name,
      visibility: (r.visibility ?? 'unknown').toLowerCase(),
      description: r.description || null,
      updatedAt: r.updatedAt ?? null,
    }));
  } catch {
    return [];
  }
}

/** Inspect one local clone. Returns null if it is not a standalone clone. */
export function inspectLocalClone(dir) {
  const dotGit = join(dir, '.git');
  if (!existsSync(dotGit) || !statSync(dotGit).isDirectory()) return null;

  const remote = run('git', ['remote', 'get-url', 'origin'], dir);
  const identity = identityFromRemote(remote);
  if (!identity) return null;

  const branches = (run('git', ['branch', '--format=%(refname:short)'], dir) ?? '')
    .split('\n').map((s) => s.trim()).filter(Boolean);

  const worktrees = (run('git', ['worktree', 'list', '--porcelain'], dir) ?? '')
    .split('\n')
    .filter((l) => l.startsWith('worktree '))
    .map((l) => l.slice('worktree '.length))
    .filter((p) => p !== dir)
    .map((p) => basename(p));

  const tags = (run('git', ['tag', '--list'], dir) ?? '')
    .split('\n').map((s) => s.trim()).filter(Boolean);

  let version = null;
  const versionFile = join(dir, 'VERSION');
  if (existsSync(versionFile)) {
    version = readFileSync(versionFile, 'utf8').trim() || null;
  } else if (existsSync(join(dir, 'package.json'))) {
    try { version = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version ?? null; }
    catch { version = null; }
  }

  const status = run('git', ['status', '--porcelain'], dir);

  return {
    identity,
    local: {
      path: basename(dir),
      branch: run('git', ['branch', '--show-current'], dir) || null,
      head: run('git', ['rev-parse', '--short', 'HEAD'], dir),
      version,
      clean: status === '',
      worktrees,
    },
    // Builds are branches following the portfolio's build convention.
    builds: branches.filter((b) => /^build\//.test(b)),
    branches,
    releases: tags,
  };
}

/**
 * Collect records for the whole portfolio.
 *
 * @param {object} options
 * @param {string} options.owner       git host account to enumerate
 * @param {string} options.root        directory containing local clones
 * @returns {{records:Array<object>, skipped:{worktrees:string[], nonRepos:string[]}}}
 */
export function collect({ owner, root }) {
  const remote = listRemoteRepositories({ owner });
  // Keyed case-insensitively: a local remote URL is often cased differently
  // from the host's own record (e.g. `acme/x` vs `Acme/x`), and
  // matching literally would split one repository into two.
  const byId = new Map(remote.map((r) => [`${r.owner}/${r.name}`.toLowerCase(), { ...r }]));

  const skipped = { worktrees: [], nonRepos: [] };

  const dirs = existsSync(root)
    ? readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory())
    : [];

  for (const d of dirs) {
    const dir = join(root, d.name);

    if (isWorktree(dir)) {
      // Folded into its parent by inspectLocalClone's worktree list.
      skipped.worktrees.push(d.name);
      continue;
    }
    if (!existsSync(join(dir, '.git'))) {
      skipped.nonRepos.push(d.name);
      continue;
    }

    const info = inspectLocalClone(dir);
    if (!info) { skipped.nonRepos.push(d.name); continue; }

    const key = `${info.identity.owner}/${info.identity.name}`.toLowerCase();
    const existing = byId.get(key) ?? {
      owner: info.identity.owner,
      name: info.identity.name,
      visibility: 'unknown',
      description: null,
      updatedAt: null,
    };

    // Where the host knows this repository, its casing is authoritative;
    // the local remote URL is not.
    byId.set(key, {
      ...existing,
      local: info.local,
      builds: info.builds,
      branches: info.branches,
      releases: info.releases,
    });
  }

  return { records: [...byId.values()], skipped };
}
