/**
 * Audience classification and the public-release boundary.
 *
 * This module is the reason an investor memo cannot end up on a public
 * website because someone forgot a metadata field. Every decision here
 * FAILS CLOSED: anything not provably, explicitly public is treated as
 * not public.
 *
 * The rules, in order:
 *   1. A missing or non-string audience is an error — never a default.
 *   2. An audience not in the instance's configured list is an error —
 *      a typo like 'pubic' must not fall through to some default branch.
 *   3. Public release requires the audience to equal the instance's single
 *      configured `public_audience`.
 *   4. If the instance configures no `public_audience`, nothing is
 *      publicly releasable at all.
 */

import { LibraryError, codes } from './errors.js';

export function validateAudience(metadata, config, subject = 'document') {
  const { audience } = metadata;

  if (typeof audience !== 'string' || audience.trim() === '') {
    throw new LibraryError(
      codes.AUDIENCE_UNKNOWN,
      `${subject}: audience is missing. Every paper must declare exactly one audience (${config.audiences.join(', ')}). Refusing to assume one.`,
      { subject },
    );
  }

  if (!config.audiences.includes(audience)) {
    throw new LibraryError(
      codes.AUDIENCE_UNKNOWN,
      `${subject}: audience '${audience}' is not recognised by this library. Configured audiences: ${config.audiences.join(', ')}.`,
      { subject, audience },
    );
  }

  return audience;
}

/** True only for a validated audience that equals the configured public one. */
export function isPubliclyReleasable(metadata, config) {
  if (!config.public_audience) return false;
  const { audience } = metadata;
  if (typeof audience !== 'string') return false;
  if (!config.audiences.includes(audience)) return false;
  return audience === config.public_audience;
}

/**
 * Gate a public-publishing path. Throws unless the paper is provably public.
 * Callers must invoke this before writing anything to a public destination.
 */
export function assertPubliclyReleasable(metadata, config, subject = 'document') {
  validateAudience(metadata, config, subject);

  if (!config.public_audience) {
    throw new LibraryError(
      codes.NO_PUBLIC_AUDIENCE_CONFIGURED,
      `${subject}: this library configures no public audience, so nothing can be published publicly. Set 'public_audience' in the library configuration if a public tier is intended.`,
      { subject },
    );
  }

  if (metadata.audience !== config.public_audience) {
    throw new LibraryError(
      codes.AUDIENCE_NOT_PUBLIC,
      `${subject}: refusing to publish publicly — audience is '${metadata.audience}', and only '${config.public_audience}' may be released publicly.`,
      { subject, audience: metadata.audience },
    );
  }

  return true;
}
