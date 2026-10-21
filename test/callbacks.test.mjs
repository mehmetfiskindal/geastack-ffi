// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { Library, defineCallback } from '../dist/index.js';

const libraryPath = process.env.GEA_CALLBACK_LIBRARY;

test('host backend passes transient JavaScript callbacks to C', { skip: !libraryPath }, () => {
  const IntCallback = defineCallback('int32', ['int32']);
  const PairCallback = defineCallback('int32', ['int32', 'int32']);

  const library = Library.open(libraryPath, {
    apply_int: { symbol: 'gea_apply_int', args: ['int32', IntCallback], returns: 'int32' },
    apply_two: { symbol: 'gea_apply_two', args: ['int32', 'int32', PairCallback], returns: 'int32' },
    call_twice: { symbol: 'gea_call_twice', args: [IntCallback], returns: 'int32' },
  }, { backend: 'native' });

  assert.equal(library.symbols.apply_int(21, (value) => value + 1), 44);
  assert.equal(library.symbols.apply_two(3, 4, (a, b) => a * b), 12);
  assert.equal(library.symbols.call_twice((value) => value + 1), 44);
  assert.throws(() => library.symbols.apply_int(1, 'not a function'), /Callback arguments/);

  library.close();
});
