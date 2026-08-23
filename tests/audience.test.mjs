/**
 * The public-release boundary.
 *
 * These are the tests that stand between an investor memo and a public
 * website. Every one of them asserts that the engine FAILS CLOSED.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertPubliclyReleasable,
  isPubliclyReleasable,
  validateAudience,
  codes,
} from '../src/index.js';
import { makeInstance } from './helpers.js';

function expectCode(fn, code) {
  try {
    fn();
  } catch (error) {
    assert.equal(error.code, code, `expected ${code}, got ${error.code}`);
    return error;
  }
  assert.fail(`expected failure with code ${code}, but nothing was thrown`);
}

test('a public paper is publicly releasable', () => {
  const { config, cleanup } = makeInstance();
  assert.equal(isPubliclyReleasable({ audience: 'public' }, config), true);
  assert.doesNotThrow(() => assertPubliclyReleasable({ audience: 'public' }, config));
  cleanup();
});

for (const audience of ['internal', 'investor', 'restricted']) {
  test(`refuses to publish '${audience}' publicly`, () => {
    const { config, cleanup } = makeInstance();
    assert.equal(isPubliclyReleasable({ audience }, config), false);
    const err = expectCode(
      () => assertPubliclyReleasable({ audience }, config),
      codes.AUDIENCE_NOT_PUBLIC,
    );
    assert.match(err.message, /refusing to publish publicly/);
    cleanup();
  });
}

test('missing audience is an error, never a default', () => {
  const { config, cleanup } = makeInstance();
  assert.equal(isPubliclyReleasable({}, config), false);
  expectCode(() => validateAudience({}, config), codes.AUDIENCE_UNKNOWN);
  expectCode(() => assertPubliclyReleasable({}, config), codes.AUDIENCE_UNKNOWN);
  cleanup();
});

test('an empty-string audience is rejected', () => {
  const { config, cleanup } = makeInstance();
  expectCode(() => assertPubliclyReleasable({ audience: '   ' }, config), codes.AUDIENCE_UNKNOWN);
  cleanup();
});

test('a typo does not fall through to a public default', () => {
  const { config, cleanup } = makeInstance();
  // 'pubic' must not be treated as 'public'.
  assert.equal(isPubliclyReleasable({ audience: 'pubic' }, config), false);
  expectCode(() => assertPubliclyReleasable({ audience: 'pubic' }, config), codes.AUDIENCE_UNKNOWN);
  cleanup();
});

test('a null audience is rejected', () => {
  const { config, cleanup } = makeInstance();
  assert.equal(isPubliclyReleasable({ audience: null }, config), false);
  cleanup();
});

test('when no public audience is configured, nothing is publishable', () => {
  const { config, cleanup } = makeInstance({ public_audience: undefined });
  assert.equal(isPubliclyReleasable({ audience: 'public' }, config), false);
  expectCode(
    () => assertPubliclyReleasable({ audience: 'public' }, config),
    codes.NO_PUBLIC_AUDIENCE_CONFIGURED,
  );
  cleanup();
});
