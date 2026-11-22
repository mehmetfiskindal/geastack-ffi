// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { Library, NativeMemory, Pointer, createCallback, defineCallback, defineStruct } from '../dist/index.js';

const libraryPath = process.env.GEA_CALLBACK_LIBRARY;

test('host backend passes transient JavaScript callbacks to C', { skip: !libraryPath }, () => {
  const IntCallback = defineCallback('int32', ['int32']);
  const PairCallback = defineCallback('int32', ['int32', 'int32']);
  const PersistentIntCallback = defineCallback('int32', ['int32'], { persistent: true });
  const PtrCallback = defineCallback('pointer', ['pointer']);
  const PersistentPtrCallback = defineCallback('pointer', ['pointer'], { persistent: true });
  const Int64Callback = defineCallback('int64', ['int64']);
  const PtrBox = defineStruct('GeaPtrBox', { ptr: 'pointer', tag: 'int32' });

  const library = Library.open(libraryPath, {
    apply_int: { symbol: 'gea_apply_int', args: ['int32', IntCallback], returns: 'int32' },
    apply_two: { symbol: 'gea_apply_two', args: ['int32', 'int32', PairCallback], returns: 'int32' },
    call_twice: { symbol: 'gea_call_twice', args: [IntCallback], returns: 'int32' },
    store_callback: { symbol: 'gea_store_callback', args: [PersistentIntCallback], returns: 'void' },
    fire_callback: { symbol: 'gea_fire_callback', args: ['int32'], returns: 'int32' },
    apply_ptr: { symbol: 'gea_apply_ptr', args: ['pointer', PtrCallback], returns: 'pointer' },
    apply_ptr_persistent: { symbol: 'gea_apply_ptr', args: ['pointer', PersistentPtrCallback], returns: 'pointer' },
    apply_i64: { symbol: 'gea_apply_i64', args: ['int64', Int64Callback], returns: 'int64' },
    swap_box_ptr: { symbol: 'gea_swap_box_ptr', args: [PtrBox, 'pointer'], returns: 'int32' },
  }, { backend: 'native' });

  assert.equal(library.symbols.apply_int(21, (value) => value + 1), 44);
  assert.equal(library.symbols.apply_two(3, 4, (a, b) => a * b), 12);
  assert.equal(library.symbols.call_twice((value) => value + 1), 44);
  assert.throws(() => library.symbols.apply_int(1, 'not a function'), /Callback arguments/);

  const persistent = createCallback(PersistentIntCallback, (value) => value * 3);
  library.symbols.store_callback(persistent);
  assert.equal(library.symbols.fire_callback(14), 42);
  library.symbols.store_callback(null);
  assert.equal(library.symbols.fire_callback(1), -1);
  persistent.release();
  assert.throws(() => library.symbols.store_callback(persistent), /already released/);
  assert.throws(() => library.symbols.store_callback((value) => value), /Persistent callback/);

  // Pointer & int64 marshaling in both transient and persistent callbacks, plus aliased symbols.
  const bufA = NativeMemory.alloc(16);
  const bufB = NativeMemory.alloc(16);
  try {
    const transientOut = library.symbols.apply_ptr(bufA, (ptr) => {
      assert.ok(ptr instanceof Pointer);
      assert.equal(ptr.address, bufA.address);
      return bufB;
    });
    assert.ok(transientOut instanceof Pointer);
    assert.equal(transientOut.address, bufB.address);
    assert.equal(library.symbols.apply_ptr(bufA, null).isNull(), true);

    const persistentPtr = createCallback(PersistentPtrCallback, (ptr) => {
      assert.ok(ptr instanceof Pointer);
      assert.equal(ptr.address, bufB.address);
      return bufA;
    });
    try {
      const persistentOut = library.symbols.apply_ptr_persistent(bufB, persistentPtr);
      assert.ok(persistentOut instanceof Pointer);
      assert.equal(persistentOut.address, bufA.address);
    } finally {
      persistentPtr.release();
    }

    const i64Out = library.symbols.apply_i64(42n, (value) => {
      assert.equal(typeof value, 'bigint');
      return value + 8n;
    });
    assert.equal(i64Out, 50n);

    // StructInstance with pointer field round-trips cleanly.
    const box = PtrBox.alloc({ ptr: bufA, tag: 5 });
    try {
      assert.equal(library.symbols.swap_box_ptr(box, bufB), 1);
      assert.equal(box.get('tag'), 15);
      const updatedPtr = box.get('ptr');
      assert.ok(updatedPtr instanceof Pointer);
      assert.equal(updatedPtr.address, bufB.address);
    } finally {
      box.free();
    }

    // NativeStructInstance with pointer field works in-place.
    const nativeBox = NativeMemory.allocStruct(PtrBox, { ptr: bufA, tag: 2 });
    try {
      assert.equal(library.symbols.swap_box_ptr(nativeBox, bufB), 1);
      assert.equal(nativeBox.get('tag'), 12);
      assert.equal(nativeBox.get('ptr').address, bufB.address);
    } finally {
      nativeBox.free();
    }
  } finally {
    NativeMemory.free(bufA);
    NativeMemory.free(bufB);
  }

  library.close();
});
