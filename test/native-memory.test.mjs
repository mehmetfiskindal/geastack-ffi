// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { Library, Memory, NativeMemory, NativeStructInstance, Pointer, defineStruct } from '../dist/index.js';

// The libc name differs per host; Windows has no POSIX libc to load.
const C_LIBRARY =
  process.platform === 'darwin'
    ? 'libSystem.B.dylib'
    : process.platform === 'linux'
      ? 'libc.so.6'
      : null;

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
    if (C_LIBRARY) {
      const libc = Library.open(
        C_LIBRARY,
        {
          strlen: { args: ['pointer'], returns: 'uint64' },
        },
        { backend: 'native' }
      );
      try {
        assert.equal(libc.symbols.strlen(string), 8n);
      } finally {
        libc.close();
      }
    }
  } finally {
    NativeMemory.free(string);
  }
});

test('NativeMemory reads and writes typed structs', () => {
  const Point = defineStruct('NativePoint', {
    x: 'int32',
    y: 'int32',
    active: 'bool',
    scale: 'double',
  });
  const point = NativeMemory.allocStruct(Point, { x: 3, y: 4, active: true, scale: 1.5 });
  try {
    assert.deepEqual(point.toObject(), { x: 3, y: 4, active: true, scale: 1.5 });
    point.set('y', 9);
    assert.equal(NativeMemory.readStruct(Point, point.pointer).get('y'), 9);
  } finally {
    point.free();
  }
});

test('NativeMemory.free rejects buffers it did not allocate', () => {
  const buffer = NativeMemory.alloc(8);
  NativeMemory.free(buffer);
  assert.throws(() => NativeMemory.free(buffer), /only accepts buffers from NativeMemory/);
});

test('NativeMemory.free revokes pointer registration to prevent use-after-free', () => {
  const buffer = NativeMemory.alloc(16);
  NativeMemory.writeInt32(buffer, 123);
  NativeMemory.free(buffer);

  assert.throws(() => NativeMemory.readInt32(buffer), /already freed/);
  assert.throws(() => NativeMemory.writeInt32(buffer, 456), /already freed/);
  assert.throws(() => NativeMemory.readBuffer(buffer, 4), /already freed/);
  assert.throws(() => NativeMemory.writeBuffer(buffer, new Uint8Array([1])), /already freed/);

  if (C_LIBRARY) {
    const libc = Library.open(
      C_LIBRARY,
      { strlen: { args: ['pointer'], returns: 'uint64' } },
      { backend: 'native' }
    );
    try {
      assert.throws(() => libc.symbols.strlen(buffer), /already freed/);
    } finally {
      libc.close();
    }
  }

  const Box = defineStruct('FreedBox', { value: 'int32' });
  const box = NativeMemory.allocStruct(Box, { value: 7 });
  assert.ok(box instanceof NativeStructInstance);
  box.free();
  assert.throws(() => box.get('value'), /already freed/);
  assert.throws(() => box.set('value', 8), /already freed/);
});

test(
  'NativeMemory.free rejects foreign native pointers',
  {
    skip: !C_LIBRARY,
  },
  () => {
    const libc = Library.open(
      C_LIBRARY,
      {
        malloc: { args: ['uint64'], returns: 'pointer' },
        free: { args: ['pointer'], returns: 'void' },
      },
      { backend: 'native' }
    );
    const raw = libc.symbols.malloc(8n);
    try {
      assert.equal(raw.isNull(), false);
      assert.throws(() => NativeMemory.free(raw), /only accepts buffers from NativeMemory/);
    } finally {
      libc.symbols.free(raw);
      libc.close();
    }
  }
);

test(
  'NativeMemory structs can be passed to native calls',
  {
    skip: !C_LIBRARY,
  },
  () => {
    const Timeval = defineStruct('NativeTimeval', {
      tv_sec: 'int64',
      tv_usec: 'int32',
    });
    const timeval = NativeMemory.allocStruct(Timeval);
    try {
      const libc = Library.open(
        C_LIBRARY,
        {
          gettimeofday: { args: ['pointer', 'pointer'], returns: 'int32' },
          gettimeofday_struct: { symbol: 'gettimeofday', args: [Timeval, 'pointer'], returns: 'int32' },
        },
        { backend: 'native' }
      );
      try {
        assert.equal(libc.symbols.gettimeofday(timeval.pointer, null), 0);
        assert(BigInt(timeval.get('tv_sec')) > 0n);
        assert(Number(timeval.get('tv_usec')) >= 0);

        // Passing NativeStructInstance directly to a StructDefinition parameter.
        timeval.set('tv_sec', 0n);
        assert.equal(libc.symbols.gettimeofday_struct(timeval, null), 0);
        assert(BigInt(timeval.get('tv_sec')) > 0n);

        // Passing a freed NativeStructInstance must throw instead of UAF.
        timeval.free();
        assert.throws(() => libc.symbols.gettimeofday_struct(timeval, null), /already freed/);
      } finally {
        libc.close();
      }
    } finally {
      timeval.free();
    }
  }
);

test(
  'Host backend rejects raw/simulated addresses inside struct pointer fields',
  {
    skip: !C_LIBRARY,
  },
  () => {
    const PtrWrapper = defineStruct('PtrWrapper', { ptr: 'pointer' });
    const libc = Library.open(
      C_LIBRARY,
      {
        // Only testing argument marshaling rejection before native invocation.
        check_struct: { symbol: 'strlen', args: [PtrWrapper], returns: 'uint64' },
      },
      { backend: 'native' }
    );
    const simulatedPtr = Memory.alloc(8);
    const simulatedStruct = PtrWrapper.alloc({ ptr: simulatedPtr });
    try {
      assert.throws(() => libc.symbols.check_struct(simulatedStruct), /simulated heap address/);
      assert.throws(() => libc.symbols.check_struct({ ptr: simulatedPtr }), /simulated heap address/);
      assert.throws(() => libc.symbols.check_struct({ ptr: 0x1234n }), /requires a native Pointer/);
      assert.throws(() => libc.symbols.check_struct(Pointer.NULL, 'extra'), /expects 1 argument/);
    } finally {
      simulatedStruct.free();
      Memory.free(simulatedPtr);
      libc.close();
    }
  }
);
