// SPDX-License-Identifier: Apache-2.0
/**
 * Real native memory for Node hosts.
 *
 * Unlike `Memory` (a deterministic simulated heap used by previews and tests),
 * these helpers allocate with koffi and return registered native pointers that
 * can be passed to `Library` calls.
 */

import koffi from 'koffi';
import { Pointer } from './memory.js';
import { adoptNativePointer, requireNativeAddress } from './native-pointers.js';

function addressOf(pointer: Pointer, label: string): bigint {
  const address = requireNativeAddress(pointer, label);
  if (address === null) throw new Error(`[GeaFFI] ${label} is NULL.`);
  return address;
}

export class NativeMemory {
  /** Allocate a zeroed native buffer and return a registered pointer. */
  static alloc(size: number): Pointer {
    const count = Math.max(1, Math.trunc(size));
    const pointer = koffi.alloc('uint8', count);
    koffi.encode(pointer, 'uint8', Array.from({ length: count }, () => 0), count);
    return adoptNativePointer(pointer);
  }

  /** Free a buffer allocated by alloc(). */
  static free(pointer: Pointer): void {
    if (pointer.isNull()) return;
    koffi.free(addressOf(pointer, 'native buffer'));
  }

  static writeBuffer(pointer: Pointer, data: Uint8Array): void {
    koffi.encode(addressOf(pointer, 'native buffer'), 'uint8', Array.from(data), data.byteLength);
  }

  static readBuffer(pointer: Pointer, length: number): Uint8Array {
    if (pointer.isNull() || length <= 0) return new Uint8Array(0);
    return Uint8Array.from(koffi.decode(addressOf(pointer, 'native buffer'), 'uint8', Math.trunc(length)) as ArrayLike<number>);
  }

  static writeCString(value: string): Pointer {
    const encoded = new TextEncoder().encode(value);
    const pointer = NativeMemory.alloc(encoded.length + 1);
    NativeMemory.writeBuffer(pointer, new Uint8Array([...encoded, 0]));
    return pointer;
  }

  static readCString(pointer: Pointer, maxLength = 65536): string {
    if (pointer.isNull()) return '';
    const address = addressOf(pointer, 'native string');
    const raw = koffi.decode(address, 'char', maxLength);
    if (raw === null || raw === undefined) return '';
    const text = String(raw);
    const nul = text.indexOf('\0');
    return nul >= 0 ? text.slice(0, nul) : text;
  }

  static readInt32(pointer: Pointer): number {
    return Number(koffi.decode(addressOf(pointer, 'int32 buffer'), 'int32'));
  }

  static writeInt32(pointer: Pointer, value: number): void {
    koffi.encode(addressOf(pointer, 'int32 buffer'), 'int32', value | 0);
  }

  static readUint32(pointer: Pointer): number {
    return Number(koffi.decode(addressOf(pointer, 'uint32 buffer'), 'uint32'));
  }

  static writeUint32(pointer: Pointer, value: number): void {
    koffi.encode(addressOf(pointer, 'uint32 buffer'), 'uint32', value >>> 0);
  }

  static readDouble(pointer: Pointer): number {
    return Number(koffi.decode(addressOf(pointer, 'double buffer'), 'double'));
  }

  static writeDouble(pointer: Pointer, value: number): void {
    koffi.encode(addressOf(pointer, 'double buffer'), 'double', value);
  }
}
