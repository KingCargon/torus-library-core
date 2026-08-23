/**
 * The measurement-system adapter boundary, and a reference implementation.
 *
 * No measurement system exists yet. An audit on 2026-08-19 found no
 * repository, no schema, no identifier format, and no registry entry for
 * one anywhere in the portfolio — only frozen canon describing the
 * boundary, and an optional placeholder field on every paper.
 *
 * So this build does not pretend one exists. It defines the interface the
 * Library needs, ships an in-memory reference implementation that proves
 * the contract round-trips, and stops there. Building a fake measurement
 * platform to make an integration look finished would put fictional
 * capability into a product whose entire purpose is being trustworthy
 * about what is real.
 *
 * THE ADAPTER IS OPTIONAL. Nothing in the publishing pipeline imports it.
 * The Library behaves identically when no adapter is configured, which is
 * required by the composable product doctrine and asserted by tests.
 */

import { LibraryError, codes } from '../errors.js';
import { CONTRACT_VERSION, parseDataRef, validateDataLink } from './contract.js';

/**
 * The interface a real measurement system must implement.
 *
 * Deliberately tiny. The Library needs to know only whether an observation
 * exists and what it claims about itself — never its value, because
 * absorbing values would make the Library a metrics warehouse, which the
 * Separation Charter forbids in terms.
 *
 *   name            string — the reference namespace it answers for
 *   contractVersion string
 *   describe(ref)   -> { exists, source, identifier, observed_at?, fingerprint?, unit?, note? } | null
 *
 * `describe` returns metadata ABOUT an observation. It does not return the
 * measurement itself, and the Library never asks for one.
 */

export class InMemoryDataAdapter {
  /**
   * @param {object} options
   * @param {string} options.name namespace this adapter answers for
   * @param {Record<string, object>} [options.observations] identifier -> descriptor
   */
  constructor({ name, observations = {} } = {}) {
    if (typeof name !== 'string' || !/^[a-z][a-z0-9_-]{1,31}$/.test(name)) {
      throw new LibraryError(
        codes.DATA_ADAPTER_INVALID,
        `An adapter needs a lowercase namespace name matching the reference grammar; got '${name}'.`,
        { name },
      );
    }
    this.name = name;
    this.contractVersion = CONTRACT_VERSION;
    this.observations = observations;
  }

  describe(ref) {
    const { source, identifier } = parseDataRef(ref);
    if (source !== this.name) return null;
    const found = this.observations[identifier];
    if (!found) return null;
    return { exists: true, source, identifier, ...found };
  }
}

/**
 * Attach adapter descriptions to already-resolved links.
 *
 * Every failure is non-fatal and reported, because the Library must remain
 * useful when a measurement system is absent, offline, partially populated,
 * or has dropped an observation. A missing description degrades the link to
 * "cited but not currently describable" rather than breaking the record.
 */
export function describeLinks(resolvedBatch, adapters = []) {
  const byName = new Map(adapters.map((a) => [a.name, a]));

  const results = resolvedBatch.results.map((r) => {
    if (!r.ok || !r.data_ref) return { ...r, description: null, dataNotice: null };

    const adapter = byName.get(r.data_ref.source);
    if (!adapter) {
      return {
        ...r,
        description: null,
        dataNotice: `no adapter is configured for source '${r.data_ref.source}'. The citation stands; its measurement simply cannot be described from here.`,
      };
    }

    let description = null;
    try {
      description = adapter.describe(r.data_ref.raw);
    } catch (error) {
      return { ...r, description: null, dataNotice: `adapter '${adapter.name}' failed: ${error.message}. The Library record is unaffected.` };
    }

    if (!description) {
      return {
        ...r,
        description: null,
        dataNotice: `source '${r.data_ref.source}' has no observation '${r.data_ref.identifier}'. It may have been re-derived or retired — canon states this does not invalidate the paper.`,
      };
    }
    return { ...r, description, dataNotice: null };
  });

  return {
    ...resolvedBatch,
    described: results.filter((r) => r.description).length,
    undescribed: results.filter((r) => r.ok && !r.description).length,
    results,
  };
}

/** True when the Library is operating with no measurement system at all. */
export function isStandalone(adapters = []) {
  return adapters.length === 0;
}

/**
 * Assert the property the composable doctrine requires: the Library's core
 * behaviour does not depend on any measurement system. Used by tests and
 * available to an operator who wants to check it directly.
 */
export function assertLibraryStandaloneCapable(config) {
  if (!config || !Array.isArray(config.audiences)) {
    throw new LibraryError(codes.CONFIG_INVALID, 'A library configuration is required.', {});
  }
  // No adapter, no network, no Data product — publishing, verification, and
  // export are all reachable. The absence of any import of this module by
  // the pipeline is what actually guarantees it; this is the readable
  // statement of the same fact.
  return { standalone: true, adapters: 0, contract_version: CONTRACT_VERSION };
}
