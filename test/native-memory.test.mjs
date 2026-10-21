// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { Library, NativeMemory } from '../dist/index.js';

test('NativeMemory allocates real memory usable by native calls', () => {
  const buffer = NativeMemory.alloc(16);
  try {
    NativeMemory.writeInt32(buffer, 42);
    assert.equal(NativeMemory.readInt32(buffer), 42);
    NativeMemory.writeUint32(buffer, 0xffffffff);
    assert.equal(NativeMemory.readUint32(buffer), 0xffffffff);
    NativeMemory.writeDouble(buffer, 1.75);
    assert.equal(NativeMemory.readDouble(buffer), 1.75);
    NativeMemory.writeBuffer(buffer, new Uint8Array([1, 2, 3]));
    assert.deepEqual(NativeMemory.readBuffer(buffer, 3), new Uint8Array([1, 2, 3]));
  } finally {
    NativeMemory.free(buffer);
  }

  const string = NativeMemory.writeCString('geastack');
  try {
    assert.equal(NativeMemory.readCString(string), 'geastack');
    const libcPath = process.platform === 'darwin' ? 'libSystem.B.dylib' : 'libc.so.6';
    const libc = Library.open(libcPath, {
      strlen: { args: ['pointer'], returns: 'uint64' },
    }, { backend: 'native' });
    try {
      assert.equal(libc.symbols.strlen(string), 8n);
    } finally {
      libc.close();
    }
  } finally {
    NativeMemory.free(string);
  }
});
