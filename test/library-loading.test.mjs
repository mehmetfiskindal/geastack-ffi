// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Library,
  registerMockFunction,
  getPlatformLibraryExtension,
  resolvePlatformLibraryName,
} from '../dist/index.js';

test('getPlatformLibraryExtension returns platform extension', () => {
  assert.equal(getPlatformLibraryExtension('macos'), '.dylib');
  assert.equal(getPlatformLibraryExtension('ios'), '.dylib');
  assert.equal(getPlatformLibraryExtension('windows'), '.dll');
  assert.equal(getPlatformLibraryExtension('linux'), '.so');
  assert.equal(getPlatformLibraryExtension('android'), '.so');
});

test('resolvePlatformLibraryName normalizes shared library names across OSes', () => {
  assert.equal(resolvePlatformLibraryName('sqlite3', 'windows'), 'sqlite3.dll');
  assert.equal(resolvePlatformLibraryName('user32.dll', 'windows'), 'user32.dll');
  assert.equal(resolvePlatformLibraryName('sqlite3', 'linux'), 'libsqlite3.so');
  assert.equal(resolvePlatformLibraryName('libm', 'linux'), 'libm.so');
  assert.equal(resolvePlatformLibraryName('libc.so.6', 'linux'), 'libc.so.6');
  assert.equal(resolvePlatformLibraryName('sqlite3', 'macos'), 'libsqlite3.dylib');
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
