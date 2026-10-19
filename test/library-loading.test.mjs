// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Library,
  registerMockFunction,
  getPlatformLibraryExtension,
} from '../dist/index.js';

test('getPlatformLibraryExtension returns platform extension', () => {
  assert.equal(getPlatformLibraryExtension('macos'), '.dylib');
  assert.equal(getPlatformLibraryExtension('ios'), '.dylib');
  assert.equal(getPlatformLibraryExtension('windows'), '.dll');
  assert.equal(getPlatformLibraryExtension('linux'), '.so');
  assert.equal(getPlatformLibraryExtension('android'), '.so');
});

test('Library.open binds and invokes native functions with mock support', () => {
  registerMockFunction('libmath', 'add', (a, b) => a + b);
  registerMockFunction('libmath', 'multiply', (a, b) => a * b);

  const lib = Library.open('libmath', {
    add: {
      args: ['int32', 'int32'],
      returns: 'int32',
    },
    multiply: {
      args: ['int32', 'int32'],
      returns: 'int32',
    },
  });

  assert.equal(lib.symbols.add(15, 27), 42);
  assert.equal(lib.symbols.multiply(6, 7), 42);

  lib.close();
  assert.throws(() => {
    lib.symbols.add(1, 2);
  }, /is closed/);
});
