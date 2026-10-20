// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { Library, registerMockFunction } from '../../dist/index.js';

test('mock backend invokes registered functions and does not load a shared library', () => {
  registerMockFunction('libmath', 'add', (a, b) => a + b);
  registerMockFunction('libmath', 'multiply', (a, b) => a * b);

  const lib = Library.open('libmath', {
    add: { args: ['int32', 'int32'], returns: 'int32' },
    multiply: { args: ['int32', 'int32'], returns: 'int32' },
  }, { backend: 'mock' });

  assert.equal(lib.symbols.add(15, 27), 42);
  assert.equal(lib.symbols.multiply(6, 7), 42);
  assert.equal(lib.getSymbolAddress('add').address, 0x30000000n);

  lib.close();
  assert.throws(() => {
    lib.symbols.add(1, 2);
  }, /is closed/);
});

test('auto backend uses mocks when the library name has registered mocks', () => {
  registerMockFunction('libmath-auto', 'add', (a, b) => a + b);

  const lib = Library.open('libmath-auto', {
    add: { args: ['int32', 'int32'], returns: 'int32' },
  });

  assert.equal(lib.symbols.add(2, 3), 5);
  lib.close();
});

test('mock backend returns placeholder values when no function is registered', () => {
  const lib = Library.open('missing-on-purpose', {
    answer: { args: ['int32'], returns: 'int32' },
  }, { backend: 'mock' });

  assert.equal(lib.symbols.answer(1), 0);
  lib.close();
});
