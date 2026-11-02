// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { Library } from '../dist/index.js';

const missingLibrary = '/nonexistent/gea_ffi_descriptor_test.so';

test('descriptor.async is rejected instead of silently running synchronously', () => {
  assert.throws(
    () =>
      Library.open(
        missingLibrary,
        {
          work: { args: [], returns: 'void', async: true },
        },
        { backend: 'native' }
      ),
    /descriptor\.async/
  );
});

test('an unsupported calling convention is rejected instead of falling back', () => {
  assert.throws(
    () =>
      Library.open(
        missingLibrary,
        {
          win64_call: { args: [], returns: 'void', abi: 'win64' },
        },
        { backend: 'native' }
      ),
    /calling convention/
  );
});

test('supported calling conventions still open the library', () => {
  assert.throws(
    () =>
      Library.open(
        missingLibrary,
        {
          cdecl_call: { args: [], returns: 'void', abi: 'cdecl' },
        },
        { backend: 'native' }
      ),
    /Failed to load shared library/
  );
});
