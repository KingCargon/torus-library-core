#!/usr/bin/env node
/**
 * torus-library — CLI for the Library publishing and integrity engine.
 *
 * Commands:
 *   validate <paper.md>     validate metadata only; writes nothing
 *   publish  <paper.md>     run the full pipeline and freeze as canon
 *     --dry-run             validate + render, write nothing
 *   verify [--id <ID>]      re-hash stored canon and compare to manifest
 *   export-public <ID>      copy a canon paper to the public destination
 *   manifest                print the manifest summary
 *
 * Global: --config <path>   defaults to ./library.config.json
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { loadConfigFile } from '../src/config.js';
import { publish, exportPublic, verify } from '../src/publish.js';
import { validateMetadata } from '../src/metadata.js';
import * as frontmatter from '../src/frontmatter.js';
import * as manifestStore from '../src/manifest.js';
import { buildIndex, renderIndexMarkdown } from '../src/portfolio.js';
import { collect } from '../src/sources/git-portfolio.js';
import { generateEntries } from '../src/chronicle.js';
import { extractReferences, resolveReference } from '../src/reference.js';
import { generateSite } from '../src/site/generate.js';
import { initLibrary } from '../src/init/scaffold.js';
import { buildDiligenceIndex, renderDiligenceMarkdown } from '../src/diligence/index-builder.js';
import { exportFor, readExportLog, verifyPackage } from '../src/diligence/export.js';
import { LibraryError } from '../src/errors.js';

function parseArgs(argv) {
  const args = { _: [], config: 'library.config.json', dryRun: false, id: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--config') args.config = argv[++i];
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--id') args.id = argv[++i];
    else if (a === '--owner') args.owner = argv[++i];
    else if (a === '--root') args.root = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--date') args.date = argv[++i];
    else if (a === '--audience') args.audience = argv[++i];
    else if (a === '--base-url') args.baseUrl = argv[++i];
    else if (a === '--also') args.also = argv[++i];
    else if (a === '--organisation' || a === '--organization') args.organisation = argv[++i];
    else if (a === '--prefix') args.prefix = argv[++i];
    else if (a === '--imprint') args.imprint = argv[++i];
    else if (a === '--force') args.force = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else args._.push(a);
  }
  return args;
}

const pkgVersion = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

const USAGE = `torus-library — institutional document publishing and integrity

Usage:
  torus-library init --organisation "<name>" --prefix <ABC>
                                           Create a new library here
  torus-library validate <paper.md>        Validate metadata; write nothing
  torus-library publish <paper.md>         Publish and freeze as canon
  torus-library publish <paper.md> --dry-run
  torus-library verify [--id <ID>]         Re-hash canon, compare to manifest
  torus-library export-public <ID>         Export a public paper
  torus-library manifest                   Show the manifest summary

Chronicle & indexing (Build 03):
  torus-library index --owner <acct> --root <dir>
                                           Build the portfolio index
  torus-library chronicle --out <dir>      Generate chronicle entry drafts
  torus-library check-refs <paper.md>      Resolve cross-repository references

Public face (Build 04):
  torus-library site [--out <dir>] [--base-url <url>]
                                           Generate the public static site

Diligence & handover (Build 05):
  torus-library diligence [--out <dir>]    Generate the diligence index
  torus-library export --audience <a> [--also <a,b>] [--out <dir>]
                                           Build a file-handover package
  torus-library verify-package <dir>       Verify a package against its hashes
  torus-library export-log                 Show what packages were generated

Options:
  --config <path>   Library configuration (default: library.config.json)
`;

function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];

  if (!command || args.help) {
    process.stdout.write(USAGE);
    return 0;
  }

  if (command === 'init') {
    const r = initLibrary({
      dir: args.out ? resolve(args.out) : process.cwd(),
      organisation: args.organisation,
      prefix: args.prefix,
      ...(args.imprint ? { imprint: args.imprint } : {}),
      force: args.force ?? false,
    });
    process.stdout.write(
      `LIBRARY CREATED\n` +
        `  organisation  ${r.organisation}\n` +
        `  id prefix     ${r.prefix}\n` +
        `  config        ${r.configPath}\n` +
        `  first paper   ${r.seedPath}\n\n` +
        `Next:\n` +
        `  1. edit the first paper\n` +
        `  2. torus-library validate ${r.seedPath}\n` +
        `  3. set status: review, add an approver\n` +
        `  4. torus-library publish ${r.seedPath}\n`,
    );
    return 0;
  }

  const configPath = resolve(args.config);
  if (!existsSync(configPath)) {
    process.stderr.write(
      `error: no library configuration at '${configPath}'. Pass --config <path>.\n`,
    );
    return 2;
  }
  const config = loadConfigFile(configPath);

  switch (command) {
    case 'validate': {
      const target = args._[1];
      if (!target) throw new Error('validate requires a paper path');
      const raw = readFileSync(resolve(target), 'utf8');
      const { metadata } = frontmatter.parse(raw, target);
      validateMetadata(metadata, config, target);
      process.stdout.write(
        `ok  ${metadata.id}  status=${metadata.status}  audience=${metadata.audience}\n`,
      );
      return 0;
    }

    case 'publish': {
      const target = args._[1];
      if (!target) throw new Error('publish requires a paper path');
      const result = publish(resolve(target), config, { dryRun: args.dryRun });
      if (result.dryRun) {
        process.stdout.write(
          `DRY RUN — nothing written\n` +
            `  id            ${result.id}\n` +
            `  title         ${result.title}\n` +
            `  audience      ${result.audience}\n` +
            `  source sha256 ${result.source_sha256}\n` +
            `  would write   ${result.wouldWrite.markdown}\n` +
            `                ${result.wouldWrite.pdf}\n`,
        );
      } else {
        process.stdout.write(
          `CANON FROZEN\n` +
            `  id            ${result.id}\n` +
            `  audience      ${result.audience}\n` +
            `  markdown      ${result.markdown}\n` +
            `  pdf           ${result.pdf}\n` +
            `  source sha256 ${result.source_sha256}\n` +
            `  pdf    sha256 ${result.pdf_sha256}\n` +
            `  frozen at     ${result.frozen_at}\n` +
            (result.supersededPrior ? `  superseded    ${result.supersededPrior}\n` : '') +
            (result.amendedPrior ? `  amended       ${result.amendedPrior}\n` : ''),
        );
      }
      return 0;
    }

    case 'verify': {
      const report = verify(config, { id: args.id });
      for (const r of report.results) {
        if (r.ok) process.stdout.write(`ok      ${r.id}\n`);
        else {
          process.stdout.write(`FAILED  ${r.id}\n`);
          for (const p of r.problems) process.stdout.write(`          ${p.code}: ${p.detail}\n`);
        }
      }
      process.stdout.write(
        `\n${report.ok ? 'integrity ok' : 'INTEGRITY FAILURE'} — ${report.checked} paper(s) checked\n`,
      );
      return report.ok ? 0 : 1;
    }

    case 'export-public': {
      const id = args._[1];
      if (!id) throw new Error('export-public requires a document ID');
      const result = exportPublic(id, config);
      process.stdout.write(`exported ${result.id} (${result.audience})\n  ${result.pdf}\n`);
      return 0;
    }

    case 'manifest': {
      const m = manifestStore.load(config);
      const entries = Object.values(m.entries);
      process.stdout.write(`${entries.length} paper(s)\n`);
      for (const e of entries) {
        process.stdout.write(`  ${e.id}  ${e.status.padEnd(10)} ${e.audience.padEnd(10)} ${e.title}\n`);
      }
      return 0;
    }

    case 'index': {
      const owner = args.owner;
      const root = args.root ?? resolve(configPath, '..', '..');
      if (!owner) throw new Error('index requires --owner <account>');

      const { records, skipped } = collect({ owner, root });
      const index = buildIndex(records);

      const outDir = args.out ? resolve(args.out) : join(config.baseDir, 'index');
      mkdirSync(outDir, { recursive: true });
      writeFileSync(join(outDir, 'portfolio-index.json'), `${JSON.stringify(index, null, 2)}\n`, 'utf8');
      writeFileSync(join(outDir, 'portfolio-index.md'), renderIndexMarkdown(index, config), 'utf8');

      process.stdout.write(
        `PORTFOLIO INDEXED\n` +
          `  repositories   ${index.counts.repositories}\n` +
          `  cloned locally ${index.counts.cloned_locally}\n` +
          `  remote only    ${index.counts.remote_only}\n` +
          `  worktrees      ${index.counts.worktrees} (folded into parents, never indexed as products)\n` +
          `  public/private ${index.counts.public}/${index.counts.private}\n` +
          `  skipped        ${skipped.worktrees.length} worktree dirs, ${skipped.nonRepos.length} non-repo dirs\n` +
          `  written        ${join(outDir, 'portfolio-index.json')}\n`,
      );
      return 0;
    }

    case 'chronicle': {
      const indexPath = join(config.baseDir, 'index', 'portfolio-index.json');
      if (!existsSync(indexPath)) {
        process.stderr.write(`error: no portfolio index at ${indexPath}. Run 'torus-library index' first.\n`);
        return 2;
      }
      const index = JSON.parse(readFileSync(indexPath, 'utf8'));
      const entries = generateEntries(index, config, {
        ...(args.date ? { date: args.date } : {}),
        ...(args.audience ? { audience: args.audience } : {}),
      });

      const outDir = args.out ? resolve(args.out) : config.resolved.papers;
      mkdirSync(outDir, { recursive: true });
      for (const e of entries) writeFileSync(join(outDir, e.filename), e.contents, 'utf8');

      process.stdout.write(
        `CHRONICLE DRAFTS GENERATED\n` +
          `  entries ${entries.length}\n` +
          `  status  draft (nothing canonized — publish deliberately)\n` +
          `  written ${outDir}\n`,
      );
      for (const e of entries) process.stdout.write(`    ${e.id}  ${e.repository}\n`);
      return 0;
    }

    case 'site': {
      const result = generateSite(config, {
        ...(args.out ? { outDir: resolve(args.out) } : {}),
        ...(args.baseUrl ? { baseUrl: args.baseUrl } : {}),
      });
      process.stdout.write(
        `PUBLIC SITE GENERATED\n` +
          `  published ${result.published.length} document(s)\n` +
          `  excluded  ${result.excluded.length} (not public canon)\n` +
          `  files     ${result.files.length}\n` +
          `  output    ${result.outDir}\n`,
      );
      for (const id of result.published) process.stdout.write(`    PUBLIC  ${id}\n`);
      for (const e of result.excluded) process.stdout.write(`    held    ${e.id} — ${e.reason}\n`);
      return 0;
    }

    case 'diligence': {
      const index = buildDiligenceIndex(config);
      const outDir = args.out ? resolve(args.out) : join(config.baseDir, 'diligence');
      mkdirSync(outDir, { recursive: true });
      writeFileSync(join(outDir, 'diligence-index.json'), `${JSON.stringify(index, null, 2)}\n`, 'utf8');
      writeFileSync(join(outDir, 'diligence-index.md'), renderDiligenceMarkdown(index, config), 'utf8');
      process.stdout.write(
        `DILIGENCE INDEX\n` +
          `  categories        ${index.counts.categories}\n` +
          `  with evidence     ${index.counts.covered}\n` +
          `  gaps              ${index.counts.gaps}\n` +
          `  canon papers      ${index.counts.canon_papers}\n` +
          `  restricted refs   ${index.counts.restricted_references}\n` +
          `  written           ${outDir}\n`,
      );
      if (index.gaps.length) process.stdout.write(`  no evidence yet:  ${index.gaps.join(', ')}\n`);
      return 0;
    }

    case 'export': {
      const audience = args.audience;
      if (!audience) throw new Error('export requires --audience <audience>');
      const alsoInclude = args.also ? args.also.split(',').map((s) => s.trim()).filter(Boolean) : [];
      const res = exportFor(config, audience, {
        alsoInclude,
        ...(args.out ? { outDir: resolve(args.out) } : {}),
        engineVersion: pkgVersion,
      });
      process.stdout.write(
        `EXPORT PACKAGE\n` +
          `  export id     ${res.exportId}\n` +
          `  audience      ${audience}${alsoInclude.length ? ` (+ ${alsoInclude.join(', ')})` : ''}\n` +
          `  documents     ${res.included.length}\n` +
          `  excluded      ${res.excluded.length}\n` +
          `  package sha   ${res.packageHash}\n` +
          `  output        ${res.outDir}\n` +
          `  delivery      file handover — nothing is served over a network\n`,
      );
      for (const id of res.included) process.stdout.write(`    INCLUDED  ${id}\n`);
      return 0;
    }

    case 'verify-package': {
      const dir = args._[1];
      if (!dir) throw new Error('verify-package requires a package directory');
      const r = verifyPackage(resolve(dir));
      for (const p of r.problems) process.stdout.write(`FAILED  ${p.id}: ${p.problem}\n`);
      process.stdout.write(`\n${r.ok ? 'package ok' : 'PACKAGE FAILURE'} — ${r.checked} document(s) checked\n`);
      return r.ok ? 0 : 1;
    }

    case 'export-log': {
      const log = readExportLog(config);
      process.stdout.write(`${log.exports.length} export(s)\n`);
      for (const e of log.exports) {
        process.stdout.write(`  ${e.export_id}  ${e.generated_at}  ${e.audience.padEnd(10)} ${e.document_count} doc(s)  ${e.package_sha256.slice(0,12)}…\n`);
      }
      return 0;
    }

    case 'check-refs': {
      const target = args._[1];
      if (!target) throw new Error('check-refs requires a paper path');
      const indexPath = join(config.baseDir, 'index', 'portfolio-index.json');
      if (!existsSync(indexPath)) {
        process.stderr.write(`error: no portfolio index at ${indexPath}. Run 'torus-library index' first.\n`);
        return 2;
      }
      const index = JSON.parse(readFileSync(indexPath, 'utf8'));
      const refs = extractReferences(readFileSync(resolve(target), 'utf8'));
      if (refs.length === 0) { process.stdout.write('no cross-repository references found\n'); return 0; }

      let bad = 0;
      for (const raw of refs) {
        const r = resolveReference(raw, index);
        if (r.ok) process.stdout.write(`ok      ${raw}\n`);
        else { bad += 1; process.stdout.write(`BROKEN  ${raw}\n          ${r.problem}\n`); }
      }
      process.stdout.write(`\n${bad === 0 ? 'all references resolve' : `${bad} BROKEN reference(s)`} — ${refs.length} checked\n`);
      return bad === 0 ? 0 : 1;
    }

    default:
      process.stderr.write(`error: unknown command '${command}'\n\n${USAGE}`);
      return 2;
  }
}

try {
  process.exitCode = main();
} catch (error) {
  if (error instanceof LibraryError) {
    process.stderr.write(`error [${error.code}]\n${error.message}\n`);
    process.exitCode = 1;
  } else {
    process.stderr.write(`error: ${error.message}\n`);
    process.exitCode = 2;
  }
}
