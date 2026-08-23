/**
 * Public API of the Library engine.
 *
 * Consumers depend on this module only. Nothing here knows about any
 * particular organisation — behaviour comes from the config object passed
 * in by the caller (ADR-0002).
 */

export { loadConfigFile, loadConfigObject } from './config.js';
export { publish, exportPublic, verify } from './publish.js';
export { validateMetadata } from './metadata.js';
export { validateAudience, isPubliclyReleasable, assertPubliclyReleasable } from './audience.js';
export { parseId, validateId } from './identity.js';
export { hashBytes, hashString, hashFile } from './hash.js';
export { renderHtml } from './render.js';
export { rendererAvailable, resolveRenderer, htmlToPdf } from './pdf.js';
export { parseReference, formatReference, resolveReference, extractReferences } from './reference.js';
export { buildIndex, sortedRepositories, renderIndexMarkdown } from './portfolio.js';
export { generateEntries, renderEntryBody } from './chronicle.js';
export * as gitPortfolio from './sources/git-portfolio.js';
export { initLibrary, DEFAULT_TYPE_CODES } from './init/scaffold.js';
export { generateSite, isEligible } from './site/generate.js';
export { CONTRACT_VERSION, parseDataRef, validateDataLink, checkContractVersion } from './data/contract.js';
export { resolveCitation, resolveLinks, assertLinkVisibleTo } from './data/resolve.js';
export { InMemoryDataAdapter, describeLinks, isStandalone, assertLibraryStandaloneCapable } from './data/adapter.js';
export { scanText, scanValue, assertNoSecrets } from './diligence/secrets.js';
export { validateReference, mostRestrictiveAudience } from './diligence/reference.js';
export { buildDiligenceIndex, renderDiligenceMarkdown, loadReferences, categoriesFor, DEFAULT_CATEGORIES } from './diligence/index-builder.js';
export { exportFor, isIncluded, readExportLog, verifyPackage } from './diligence/export.js';
export * as manifest from './manifest.js';
export * as frontmatter from './frontmatter.js';
export { LibraryError, codes } from './errors.js';
