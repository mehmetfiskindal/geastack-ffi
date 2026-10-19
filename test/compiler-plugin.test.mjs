// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFfiCompilerPlugin } from '../dist/index.js';

test('createFfiCompilerPlugin produces valid plugin descriptor', () => {
  const plugin = createFfiCompilerPlugin();
  assert.equal(plugin.name, '@geastack/ffi');
  assert.equal(plugin.version, '0.1.0');
  assert(plugin.headers.includes('gea/ffi/gea_ffi.h'));
  assert(plugin.nativeSources.includes('src/native/gea_ffi_core.cpp'));
});
