// SPDX-License-Identifier: Apache-2.0
/**
 * @geastack/ffi - Memory and Pointer Management
 * Safe low-level buffer, pointer abstraction, and C-string utilities.
 */

import { PrimitiveType, PRIMITIVE_SIZES } from './types.js';

/**
 * Native Pointer representation.
 * Supports both 32-bit (embedded/microcontrollers) and 64-bit platforms.
 */
export class Pointer {
  readonly address: bigint;

  constructor(address: bigint | number | string | Pointer) {
    if (address instanceof Pointer) {
      this.address = address.address;
    } else if (typeof address === 'bigint') {
      this.address = address;
    } else if (typeof address === 'number') {
      this.address = BigInt(address);
    } else {
      this.address = BigInt(address);
    }
  }

  /**
   * Represents the NULL pointer (address 0x0).
   */
  static readonly NULL = new Pointer(0n);

  /**
   * Check if this pointer is NULL (0x0).
   */
  isNull(): boolean {
    return this.address === 0n;
  }

  /**
   * Create a new pointer offset by a number of bytes.
   */
  offset(bytes: number | bigint): Pointer {
    return new Pointer(this.address + BigInt(bytes));
  }

  /**
   * Returns hexadecimal representation of pointer address.
   */
  toHex(): string {
    return '0x' + this.address.toString(16).padStart(16, '0');
  }

  toString(): string {
    return this.toHex();
  }

  valueOf(): bigint {
    return this.address;
  }
}

/**
 * In-memory backing buffer tracking for JS runtime execution and mock testing.
 * When running in C++ AOT mode, these map to raw `malloc`, `free`, and direct memory dereferences.
 */
class MemoryHeap {
  private allocations = new Map<bigint, { buffer: Uint8Array; view: DataView; size: number }>();
  private nextAddress = 0x10000000n; // Simulated starting heap address

  alloc(size: number): Pointer {
    if (size <= 0) {
      return Pointer.NULL;
    }
    const address = this.nextAddress;
    // Align to 8 bytes
    const alignedSize = (size + 7) & ~7;
    this.nextAddress += BigInt(alignedSize);

    const buffer = new Uint8Array(size);
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    this.allocations.set(address, { buffer, view, size });
    return new Pointer(address);
  }

  free(ptr: Pointer): void {
    if (ptr.isNull()) return;
    this.allocations.delete(ptr.address);
  }

  resolve(ptr: Pointer): { buffer: Uint8Array; view: DataView; offset: number } {
    if (ptr.isNull()) {
      throw new Error('[GeaFFI] NullPointerDereference: Attempted to dereference NULL pointer.');
    }
    const targetAddr = ptr.address;
    for (const [baseAddr, entry] of this.allocations.entries()) {
      if (targetAddr >= baseAddr && targetAddr < baseAddr + BigInt(entry.size)) {
        const offset = Number(targetAddr - baseAddr);
        return {
          buffer: entry.buffer,
          view: entry.view,
          offset,
        };
      }
    }
    // If not found in tracked heap (e.g. static memory), return a virtual entry if address is non-zero
    throw new Error(`[GeaFFI] BadPointerAccess: Invalid or unallocated memory address ${ptr.toHex()}`);
  }

  registerBuffer(address: bigint, buffer: Uint8Array): Pointer {
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    this.allocations.set(address, { buffer, view, size: buffer.byteLength });
    return new Pointer(address);
  }
}

const globalHeap = new MemoryHeap();

/**
 * Safe Low-level Memory Operations.
 */
export class Memory {
  /**
   * Allocate `size` bytes of uninitialized memory.
   */
  static alloc(size: number): Pointer {
    return globalHeap.alloc(size);
  }

  /**
   * Free previously allocated memory.
   */
  static free(pointer: Pointer): void {
    globalHeap.free(pointer);
  }

  /**
   * Allocate memory and copy a UTF-8 string with a null-terminator (\0).
   */
  static writeCString(str: string): Pointer {
    const encoder = new TextEncoder();
    const encoded = encoder.encode(str);
    const ptr = Memory.alloc(encoded.length + 1);
    const { buffer, offset } = globalHeap.resolve(ptr);
    buffer.set(encoded, offset);
    buffer[offset + encoded.length] = 0; // Null terminator
    return ptr;
  }

  /**
   * Read a null-terminated UTF-8 C-string from a memory address.
   */
  static readCString(pointer: Pointer, maxLength = 65536): string {
    if (pointer.isNull()) return '';
    const { buffer, offset } = globalHeap.resolve(pointer);
    let end = offset;
    const maxEnd = Math.min(buffer.length, offset + maxLength);
    while (end < maxEnd && buffer[end] !== 0) {
      end++;
    }
    const slice = buffer.subarray(offset, end);
    const decoder = new TextDecoder('utf-8');
    return decoder.decode(slice);
  }

  /**
   * Allocate memory and copy a UTF-16LE wide string (wchar_t* / LPCWSTR) with a 2-byte null-terminator.
   */
  static writeWString(str: string): Pointer {
    const byteLength = (str.length + 1) * 2;
    const ptr = Memory.alloc(byteLength);
    const { view, offset } = globalHeap.resolve(ptr);
    for (let i = 0; i < str.length; i++) {
      view.setUint16(offset + i * 2, str.charCodeAt(i), true);
    }
    view.setUint16(offset + str.length * 2, 0, true); // Null terminator (L'\0')
    return ptr;
  }

  /**
   * Read a null-terminated UTF-16LE wide string (wchar_t* / LPCWSTR) from a memory address.
   */
  static readWString(pointer: Pointer, maxChars = 65536): string {
    if (pointer.isNull()) return '';
    const { view, buffer, offset } = globalHeap.resolve(pointer);
    const codeUnits: number[] = [];
    const maxBytes = Math.min(buffer.length - offset, maxChars * 2);
    for (let byteOffset = 0; byteOffset + 1 < maxBytes; byteOffset += 2) {
      const codeUnit = view.getUint16(offset + byteOffset, true);
      if (codeUnit === 0) break;
      codeUnits.push(codeUnit);
    }
    return String.fromCharCode(...codeUnits);
  }

  /**
   * Copy a raw Uint8Array buffer into freshly allocated native memory.
   */
  static writeBuffer(data: Uint8Array): Pointer {
    const ptr = Memory.alloc(data.byteLength);
    const { buffer, offset } = globalHeap.resolve(ptr);
    buffer.set(data, offset);
    return ptr;
  }

  /**
   * Read a slice of bytes from a pointer into a Uint8Array.
   */
  static readBuffer(pointer: Pointer, length: number): Uint8Array {
    if (pointer.isNull() || length === 0) return new Uint8Array(0);
    const { buffer, offset } = globalHeap.resolve(pointer);
    return buffer.slice(offset, offset + length);
  }

  // Primitive Type Read Operations
  static readBool(pointer: Pointer): boolean {
    const { view, offset } = globalHeap.resolve(pointer);
    return view.getUint8(offset) !== 0;
  }

  static readInt8(pointer: Pointer): number {
    const { view, offset } = globalHeap.resolve(pointer);
    return view.getInt8(offset);
  }

  static readUint8(pointer: Pointer): number {
    const { view, offset } = globalHeap.resolve(pointer);
    return view.getUint8(offset);
  }

  static readInt16(pointer: Pointer, littleEndian = true): number {
    const { view, offset } = globalHeap.resolve(pointer);
    return view.getInt16(offset, littleEndian);
  }

  static readUint16(pointer: Pointer, littleEndian = true): number {
    const { view, offset } = globalHeap.resolve(pointer);
    return view.getUint16(offset, littleEndian);
  }

  static readInt32(pointer: Pointer, littleEndian = true): number {
    const { view, offset } = globalHeap.resolve(pointer);
    return view.getInt32(offset, littleEndian);
  }

  static readUint32(pointer: Pointer, littleEndian = true): number {
    const { view, offset } = globalHeap.resolve(pointer);
    return view.getUint32(offset, littleEndian);
  }

  static readInt64(pointer: Pointer, littleEndian = true): bigint {
    const { view, offset } = globalHeap.resolve(pointer);
    return view.getBigInt64(offset, littleEndian);
  }

  static readUint64(pointer: Pointer, littleEndian = true): bigint {
    const { view, offset } = globalHeap.resolve(pointer);
    return view.getBigUint64(offset, littleEndian);
  }

  static readFloat(pointer: Pointer, littleEndian = true): number {
    const { view, offset } = globalHeap.resolve(pointer);
    return view.getFloat32(offset, littleEndian);
  }

  static readDouble(pointer: Pointer, littleEndian = true): number {
    const { view, offset } = globalHeap.resolve(pointer);
    return view.getFloat64(offset, littleEndian);
  }

  static readPointer(pointer: Pointer, littleEndian = true): Pointer {
    const addr = Memory.readUint64(pointer, littleEndian);
    return new Pointer(addr);
  }

  // Primitive Type Write Operations
  static writeBool(pointer: Pointer, value: boolean): void {
    const { view, offset } = globalHeap.resolve(pointer);
    view.setUint8(offset, value ? 1 : 0);
  }

  static writeInt8(pointer: Pointer, value: number): void {
    const { view, offset } = globalHeap.resolve(pointer);
    view.setInt8(offset, value);
  }

  static writeUint8(pointer: Pointer, value: number): void {
    const { view, offset } = globalHeap.resolve(pointer);
    view.setUint8(offset, value);
  }

  static writeInt16(pointer: Pointer, value: number, littleEndian = true): void {
    const { view, offset } = globalHeap.resolve(pointer);
    view.setInt16(offset, value, littleEndian);
  }

  static writeUint16(pointer: Pointer, value: number, littleEndian = true): void {
    const { view, offset } = globalHeap.resolve(pointer);
    view.setUint16(offset, value, littleEndian);
  }

  static writeInt32(pointer: Pointer, value: number, littleEndian = true): void {
    const { view, offset } = globalHeap.resolve(pointer);
    view.setInt32(offset, value, littleEndian);
  }

  static writeUint32(pointer: Pointer, value: number, littleEndian = true): void {
    const { view, offset } = globalHeap.resolve(pointer);
    view.setUint32(offset, value, littleEndian);
  }

  static writeInt64(pointer: Pointer, value: bigint, littleEndian = true): void {
    const { view, offset } = globalHeap.resolve(pointer);
    view.setBigInt64(offset, value, littleEndian);
  }

  static writeUint64(pointer: Pointer, value: bigint, littleEndian = true): void {
    const { view, offset } = globalHeap.resolve(pointer);
    view.setBigUint64(offset, value, littleEndian);
  }

  static writeFloat(pointer: Pointer, value: number, littleEndian = true): void {
    const { view, offset } = globalHeap.resolve(pointer);
    view.setFloat32(offset, value, littleEndian);
  }

  static writeDouble(pointer: Pointer, value: number, littleEndian = true): void {
    const { view, offset } = globalHeap.resolve(pointer);
    view.setFloat64(offset, value, littleEndian);
  }

  static writePointer(pointer: Pointer, value: Pointer, littleEndian = true): void {
    Memory.writeUint64(pointer, value.address, littleEndian);
  }

  /**
   * Helper to write any primitive value based on type name.
   */
  static writePrimitive(pointer: Pointer, type: PrimitiveType, value: any, littleEndian = true): void {
    switch (type) {
      case 'void': break;
      case 'bool': Memory.writeBool(pointer, Boolean(value)); break;
      case 'int8': Memory.writeInt8(pointer, Number(value)); break;
      case 'uint8': Memory.writeUint8(pointer, Number(value)); break;
      case 'int16': Memory.writeInt16(pointer, Number(value), littleEndian); break;
      case 'uint16': Memory.writeUint16(pointer, Number(value), littleEndian); break;
      case 'int32': Memory.writeInt32(pointer, Number(value), littleEndian); break;
      case 'uint32': Memory.writeUint32(pointer, Number(value), littleEndian); break;
      case 'int64': Memory.writeInt64(pointer, BigInt(value), littleEndian); break;
      case 'uint64': Memory.writeUint64(pointer, BigInt(value), littleEndian); break;
      case 'float': Memory.writeFloat(pointer, Number(value), littleEndian); break;
      case 'double': Memory.writeDouble(pointer, Number(value), littleEndian); break;
      case 'pointer':
        Memory.writePointer(pointer, value instanceof Pointer ? value : new Pointer(value ?? 0n), littleEndian);
        break;
      case 'string':
        if (typeof value === 'string') {
          const strPtr = Memory.writeCString(value);
          Memory.writePointer(pointer, strPtr, littleEndian);
        } else if (value instanceof Pointer) {
          Memory.writePointer(pointer, value, littleEndian);
        }
        break;
      case 'wstring':
        if (typeof value === 'string') {
          const wstrPtr = Memory.writeWString(value);
          Memory.writePointer(pointer, wstrPtr, littleEndian);
        } else if (value instanceof Pointer) {
          Memory.writePointer(pointer, value, littleEndian);
        }
        break;
      case 'buffer':
        if (value instanceof Uint8Array) {
          const bufPtr = Memory.writeBuffer(value);
          Memory.writePointer(pointer, bufPtr, littleEndian);
        }
        break;
    }
  }

  /**
   * Helper to read any primitive value based on type name.
   */
  static readPrimitive(pointer: Pointer, type: PrimitiveType, littleEndian = true): any {
    switch (type) {
      case 'void': return undefined;
      case 'bool': return Memory.readBool(pointer);
      case 'int8': return Memory.readInt8(pointer);
      case 'uint8': return Memory.readUint8(pointer);
      case 'int16': return Memory.readInt16(pointer, littleEndian);
      case 'uint16': return Memory.readUint16(pointer, littleEndian);
      case 'int32': return Memory.readInt32(pointer, littleEndian);
      case 'uint32': return Memory.readUint32(pointer, littleEndian);
      case 'int64': return Memory.readInt64(pointer, littleEndian);
      case 'uint64': return Memory.readUint64(pointer, littleEndian);
      case 'float': return Memory.readFloat(pointer, littleEndian);
      case 'double': return Memory.readDouble(pointer, littleEndian);
      case 'pointer': return Memory.readPointer(pointer, littleEndian);
      case 'string': {
        const strPtr = Memory.readPointer(pointer, littleEndian);
        return Memory.readCString(strPtr);
      }
      case 'wstring': {
        const wstrPtr = Memory.readPointer(pointer, littleEndian);
        return Memory.readWString(wstrPtr);
      }
      case 'buffer': {
        return Memory.readPointer(pointer, littleEndian);
      }
    }
  }
}
