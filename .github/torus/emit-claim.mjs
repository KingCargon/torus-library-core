#!/usr/bin/env node
/**
 * Emit a `torus.release-claim/v1` from a product repository.
 *
 * This runs in the PRODUCT plane. It deliberately contains no MultiBuild
 * logic, reads no MultiBuild file, and needs no credential — every fact it
 * reports is one the product repository already owns.
 *
 * What it produces is a **claim**, not a record. It asserts "this product,
 * at this version, released at this commit." Whether that is true, and what
 * it is allowed to cause, is decided by the MultiBuild control plane, which
 * validates the claim against bindings and against this product's own record
 * before accepting anything.
 *
 *   node emit-claim.mjs [--record <path>] [--out <path>]
 *
 * A repository may hold more than one product (MultiBuild §17 — `torus-skills`
 * holds three). With no `--record`, every record in the repository is
 * discovered and one claim is emitted per product, as a JSON array. The
 * control plane accepts either shape.
 *
 * Facts are taken from the environment GitHub Actions provides, falling back
 * to git for local runs. Nothing is invented: a fact that cannot be
 * determined is emitted as null and the control plane rejects the claim.
 */

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = args.indexOf(name);
  return i === -1 || i === args.length - 1 ? fallback : args[i + 1];
};

const explicitRecord = flag("--record", null);
const outPath = flag("--out", null);

/**
 * Find every canonical record in this repository.
 *
 * Mirrors the control plane's own discovery rules deliberately: dependency
 * directories hold someone else's records, `templates/` holds blanks rather
 * than products, and `.github/` holds this very script. Getting this wrong
 * produces extra claims the control plane rejects — never a wrong accept.
 */
function discoverRecords(root, depth = 0) {
  if (depth > 4) return [];
  const skip = new Set([".git", "node_modules", ".next", "dist", "build", ".turbo", "coverage", "templates", ".github"]);
  const found = [];
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
  for (const entry of entries) {
    const full = `${root}/${entry.name}`;
    if (entry.isFile() && entry.name === "torus.asset.yaml") found.push(full);
    else if (entry.isDirectory() && !skip.has(entry.name) && !entry.name.startsWith(".")) {
      found.push(...discoverRecords(full, depth + 1));
    }
  }
  return found.sort();
}

const recordPaths = explicitRecord ? [resolve(explicitRecord)] : discoverRecords(resolve("."));
if (recordPaths.length === 0) {
  console.error("No torus.asset.yaml found in this repository.");
  console.error("A product cannot claim a release without a record declaring what it is.");
  process.exit(2);
}

function git(...a) {
  try {
    return execFileSync("git", a, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

/**
 * `owner/name`, from the CI environment when present and otherwise from the
 * git remote. The remote is a fact the repository owns, so deriving it here
 * keeps the emitter runnable — and therefore provable — outside CI.
 *
 * This value is corroboration, not authority: the control plane verifies
 * which repository a claim actually came from and does not take this on
 * trust. Getting it wrong produces a rejected claim, never a wrong accept.
 */
function repositorySlug() {
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;
  const url = git("remote", "get-url", "origin");
  if (!url) return null;
  const match = /[:/]([^/:]+)\/([^/]+?)(?:\.git)?$/.exec(url.trim());
  return match ? `${match[1]}/${match[2]}` : null;
}

/**
 * Read `id` and `version` out of the product's own record.
 *
 * Deliberately a narrow line-scan rather than a YAML parser: this script must
 * stay dependency-free and self-contained so a product repository can run it
 * without installing anything. It reads two top-level scalars and nothing
 * else — if the record is shaped unexpectedly, the field comes back null and
 * the control plane rejects the claim rather than this script guessing.
 */
function readRecordField(text, field) {
  const match = new RegExp(`^  ${field}:\\s*(.+?)\\s*$`, "m").exec(text);
  if (!match) return null;
  return match[1].replace(/^["']|["']$/g, "").trim() || null;
}

const env = process.env;
const tag = env.GITHUB_REF_TYPE === "tag" ? env.GITHUB_REF_NAME : git("describe", "--tags", "--exact-match");

const provenance = {
  repository: repositorySlug(),
  commit: env.GITHUB_SHA ?? git("rev-parse", "HEAD"),
  ref: env.GITHUB_REF ?? git("rev-parse", "--abbrev-ref", "HEAD"),
  tag: tag ?? null,
  workflow_run:
    env.GITHUB_SERVER_URL && env.GITHUB_REPOSITORY && env.GITHUB_RUN_ID
      ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`
      : null,
  emitted_at: new Date().toISOString(),
  emitter_version: "2",
};

const claims = recordPaths.map((path) => {
  const text = readFileSync(path, "utf8");
  return {
    schema: "torus.release-claim/v1",
    claim: {
      product_id: readRecordField(text, "id"),
      // The record is the authority on version; the tag is corroboration the
      // control plane can check, not a second source of truth.
      version: readRecordField(text, "version"),
      released_at: new Date().toISOString(),
    },
    provenance: { ...provenance, record: path.replace(`${resolve(".")}/`, "") },
  };
});

// One product emits an object; several emit an array. The control plane
// accepts either, so a repository gaining a second product does not require
// its workflow to change.
const payload = claims.length === 1 ? claims[0] : claims;
const json = `${JSON.stringify(payload, null, 2)}\n`;
if (outPath) {
  writeFileSync(resolve(outPath), json);
  console.error(`Wrote claim to ${outPath}`);
} else {
  process.stdout.write(json);
}

// A claim missing a required fact is still emitted — the control plane must
// see and reject it, rather than this script silently producing nothing.
for (const c of claims) {
  for (const [field, value] of [
    ["claim.product_id", c.claim.product_id],
    ["claim.version", c.claim.version],
    ["provenance.repository", c.provenance.repository],
    ["provenance.commit", c.provenance.commit],
  ]) {
    if (!value) {
      console.error(`warning: ${field} could not be determined for ${c.provenance.record ?? "this product"}; the control plane will reject this claim.`);
    }
  }
}
