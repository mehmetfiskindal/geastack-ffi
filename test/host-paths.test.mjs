// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { helperLibraryCandidates } from '../dist/host-paths.js';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));

test('helper libraries resolve relative to the package root, not the process cwd', () => {
  const candidates = helperLibraryCandidates(
    'dbus-native',
    ['libgea_ffi_dbus.so'],
    'GEA_FFI_DBUS_LIBRARY',
    {}
  );
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0], path.join(packageRoot, 'build', 'dbus-native', 'libgea_ffi_dbus.so'));
  assert.ok(path.isAbsolute(candidates[0]));
});

test('an explicit environment override wins and is tried first', () => {
  const candidates = helperLibraryCandidates(
    'dconf-native',
    ['libgea_ffi_dconf.so'],
    'GEA_FFI_DCONF_LIBRARY',
    {
      GEA_FFI_DCONF_LIBRARY: '/custom/libgea_ffi_dconf.so',
    }
  );
  assert.equal(candidates[0], '/custom/libgea_ffi_dconf.so');
  assert.equal(candidates.length, 2);
});

test('candidate paths never depend on the directory the process was launched from', () => {
  const fromRepo = helperLibraryCandidates(
    'apple-block',
    ['libgea_apple_block.dylib'],
    'GEA_FFI_APPLE_BLOCK_LIBRARY',
    {}
  );
  const originalCwd = process.cwd();
  try {
    process.chdir(os.tmpdir());
    const fromRoot = helperLibraryCandidates(
      'apple-block',
      ['libgea_apple_block.dylib'],
      'GEA_FFI_APPLE_BLOCK_LIBRARY',
      {}
    );
    assert.deepEqual(fromRoot, fromRepo);
  } finally {
    process.chdir(originalCwd);
  }
});
