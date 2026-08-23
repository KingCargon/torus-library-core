/**
 * HTML -> PDF adapter.
 *
 * The renderer is isolated behind this one module on purpose (ADR-0003):
 * swapping headless Chromium for a deterministic renderer later should
 * change this file and nothing else in the pipeline.
 *
 * The binary is discovered rather than hard-coded, in this order:
 *   1. config.pdf.binary
 *   2. CHROMIUM_BINARY environment variable
 *   3. a list of standard install locations (macOS, Linux, Windows)
 *
 * No organisation-specific path is compiled in.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LibraryError, codes } from './errors.js';

const CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/snap/bin/chromium',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
];

export function resolveRenderer(config = {}) {
  const configured = config.pdf?.binary;
  if (configured) {
    if (!existsSync(configured)) {
      throw new LibraryError(
        codes.RENDERER_NOT_FOUND,
        `Configured PDF renderer was not found at '${configured}'. Fix 'pdf.binary' in the library configuration, or remove it to fall back to auto-discovery.`,
        { configured },
      );
    }
    return configured;
  }

  const fromEnv = process.env.CHROMIUM_BINARY;
  if (fromEnv) {
    if (!existsSync(fromEnv)) {
      throw new LibraryError(
        codes.RENDERER_NOT_FOUND,
        `CHROMIUM_BINARY is set to '${fromEnv}', but no file exists there.`,
        { fromEnv },
      );
    }
    return fromEnv;
  }

  const found = CANDIDATES.find((p) => existsSync(p));
  if (!found) {
    throw new LibraryError(
      codes.RENDERER_NOT_FOUND,
      `No Chrome/Chromium binary found. PDF generation needs one. Set 'pdf.binary' in the library configuration, or the CHROMIUM_BINARY environment variable, to an absolute path.`,
      { searched: CANDIDATES },
    );
  }
  return found;
}

/** True when a renderer is available — lets callers skip cleanly rather than fail. */
export function rendererAvailable(config = {}) {
  try {
    resolveRenderer(config);
    return true;
  } catch {
    return false;
  }
}

/**
 * Render HTML to a PDF file.
 * @returns {string} the outputPath written
 */
export function htmlToPdf(html, outputPath, config = {}) {
  const binary = resolveRenderer(config);
  const scratch = mkdtempSync(join(tmpdir(), 'torus-library-'));
  const htmlPath = join(scratch, 'paper.html');

  try {
    writeFileSync(htmlPath, html, 'utf8');
    execFileSync(
      binary,
      [
        '--headless',
        '--disable-gpu',
        '--no-sandbox',
        '--no-pdf-header-footer',
        `--print-to-pdf=${outputPath}`,
        `file://${htmlPath}`,
      ],
      { stdio: 'pipe', timeout: 120_000 },
    );
  } catch (cause) {
    throw new LibraryError(
      codes.RENDERER_FAILED,
      `PDF generation failed using '${binary}' — ${cause.message}`,
      { binary, cause: cause.message },
    );
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }

  if (!existsSync(outputPath)) {
    throw new LibraryError(
      codes.RENDERER_FAILED,
      `PDF generation reported success but no file was written to '${outputPath}'.`,
      { outputPath },
    );
  }

  return outputPath;
}
