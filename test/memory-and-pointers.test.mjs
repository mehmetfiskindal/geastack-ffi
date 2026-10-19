// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { Pointer, Memory } from '../dist/index.js';

test('Pointer manipulation and null checks', () => {
  const nullPtr = Pointer.NULL;
  assert.equal(nullPtr.isNull(), true);
  assert.equal(nullPtr.address, 0n);

  const ptr = new Pointer(0x1000n);
  assert.equal(ptr.isNull(), false);
  assert.equal(ptr.address, 0x1000n);
  assert.equal(ptr.toHex(), '0x0000000000001000');

  const offsetPtr = ptr.offset(16);
  assert.equal(offsetPtr.address, 0x1010n);
});

test('Memory allocation and primitive read/write', () => {
  const ptr = Memory.alloc(32);
  assert.equal(ptr.isNull(), false);

  Memory.writeInt32(ptr, 123456);
  assert.equal(Memory.readInt32(ptr), 123456);

  Memory.writeFloat(ptr.offset(4), 3.14159);
  assert(Math.abs(Memory.readFloat(ptr.offset(4)) - 3.14159) < 0.0001);

  Memory.writeInt64(ptr.offset(8), 9876543210123456n);
  assert.equal(Memory.readInt64(ptr.offset(8)), 9876543210123456n);

  Memory.free(ptr);
});

test('Memory UTF-8 CString write and read', () => {
  const text = 'GeaStack Native FFI 🚀';
  const strPtr = Memory.writeCString(text);
  assert.equal(strPtr.isNull(), false);

  const readBack = Memory.readCString(strPtr);
  assert.equal(readBack, text);

  Memory.free(strPtr);
});

test('Memory raw buffer write and read', () => {
  const bytes = new Uint8Array([1, 2, 3, 4, 5, 255]);
  const bufPtr = Memory.writeBuffer(bytes);
  assert.equal(bufPtr.isNull(), false);

  const readBytes = Memory.readBuffer(bufPtr, bytes.length);
  assert.deepEqual(Array.from(readBytes), [1, 2, 3, 4, 5, 255]);

  Memory.free(bufPtr);
});
