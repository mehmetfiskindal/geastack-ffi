// SPDX-License-Identifier: Apache-2.0
/**
 * Tracks pointers that came from a real native runtime.
 *
 * `Memory` allocates from a simulated heap. Those addresses must never be
 * handed to a native function, so every native call checks this registry first.
 */

import { Pointer } from './memory.js';

const nativePointers = new WeakSet<Pointer>();

/**
 * Wrap a raw address returned by a native call and mark it as native.
 * A zero address maps to the shared NULL pointer.
 */
export function adoptNativePointer(address: bigint | number): Pointer {
  const value = typeof address === 'bigint' ? address : BigInt(address);
  if (value === 0n) return Pointer.NULL;
  const pointer = new Pointer(value);
  nativePointers.add(pointer);
  return pointer;
}

/**
 * Mark an existing pointer as native. Returns the same instance.
 */
export function markNativePointer(pointer: Pointer): Pointer {
  if (!pointer.isNull()) {
    nativePointers.add(pointer);
  }
  return pointer;
}

/**
 * True when the pointer may be passed to a native function (including NULL).
 */
export function isNativePointer(pointer: Pointer): boolean {
  return pointer.isNull() || nativePointers.has(pointer);
}

/**
 * Convert a pointer to the address a native call expects.
 * Throws for simulated-heap pointers so a bad address cannot reach native code.
 */
export function requireNativeAddress(pointer: Pointer, label = 'pointer'): bigint | null {
  if (pointer.isNull()) return null;
  if (!nativePointers.has(pointer)) {
    throw new Error(
      `[GeaFFI] ${label} ${pointer.toHex()} is a simulated heap address and cannot be passed to a native function.`
    );
  }
  return pointer.address;
}
