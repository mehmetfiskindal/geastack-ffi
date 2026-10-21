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
import { StructDefinition } from './struct.js';
import type { FFIType } from './types.js';
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

  static allocStruct(definition: StructDefinition, initial?: Record<string, unknown>): NativeStructInstance {
    const pointer = NativeMemory.alloc(definition.size);
    const instance = new NativeStructInstance(definition, pointer, true);
    if (initial) instance.assign(initial);
    return instance;
  }

  static readStruct(definition: StructDefinition, pointer: Pointer): NativeStructInstance {
    return new NativeStructInstance(definition, pointer);
  }
}


/** A struct view over real native memory. */
export class NativeStructInstance {
  readonly definition: StructDefinition;
  readonly pointer: Pointer;
  private owned: boolean;

  constructor(definition: StructDefinition, pointer: Pointer, owned = false) {
    this.definition = definition;
    this.pointer = pointer;
    this.owned = owned;
  }

  get(fieldName: string): unknown {
    const field = this.definition.fields[fieldName];
    if (!field) throw new Error(`[GeaFFI] Unknown struct field '${fieldName}'.`);
    const address = addressOf(this.pointer, 'native struct') + BigInt(field.offset ?? 0);
    const type = field.type;
    if (typeof type !== 'string') {
      if (type instanceof StructDefinition) {
        return new NativeStructInstance(type, adoptNativePointer(address));
      }
      throw new Error('[GeaFFI] Callback fields are not supported in NativeMemory structs.');
    }
    switch (type) {
      case 'bool': return Number(koffi.decode(address, 'uint8')) !== 0;
      case 'int8': return Number(koffi.decode(address, 'int8'));
      case 'uint8': return Number(koffi.decode(address, 'uint8'));
      case 'int16': return Number(koffi.decode(address, 'int16'));
      case 'uint16': return Number(koffi.decode(address, 'uint16'));
      case 'int32': return Number(koffi.decode(address, 'int32'));
      case 'uint32': return Number(koffi.decode(address, 'uint32'));
      case 'int64': return BigInt(koffi.decode(address, 'int64'));
      case 'uint64': return BigInt(koffi.decode(address, 'uint64'));
      case 'float': return Number(koffi.decode(address, 'float'));
      case 'double': return Number(koffi.decode(address, 'double'));
      case 'pointer':
      case 'string':
      case 'wstring':
      case 'buffer': {
        const value = koffi.decode(address, 'void *');
        return value === null || value === undefined || BigInt(value) === 0n ? Pointer.NULL : adoptNativePointer(value);
      }
      default:
        throw new Error(`[GeaFFI] Unsupported struct field type '${type}'.`);
    }
  }

  set(fieldName: string, value: unknown): void {
    const field = this.definition.fields[fieldName];
    if (!field) throw new Error(`[GeaFFI] Unknown struct field '${fieldName}'.`);
    const address = addressOf(this.pointer, 'native struct') + BigInt(field.offset ?? 0);
    const type = field.type;
    if (typeof type !== 'string') {
      if (type instanceof StructDefinition) {
        if (value instanceof NativeStructInstance) {
          NativeMemory.writeBuffer(
            adoptNativePointer(address),
            NativeMemory.readBuffer(value.pointer, type.size)
          );
          return;
        }
        if (value && typeof value === 'object') {
          const nested = new NativeStructInstance(type, adoptNativePointer(address));
          nested.assign(value as Record<string, unknown>);
          return;
        }
      }
      throw new Error('[GeaFFI] Unsupported struct field assignment.');
    }
    if (type === 'pointer' || type === 'string' || type === 'wstring' || type === 'buffer') {
      if (value === null || value === undefined) {
        koffi.encode(address, 'void *', null);
      } else if (value instanceof Pointer) {
        koffi.encode(address, 'void *', requireNativeAddress(value, 'native pointer field') as bigint);
      } else {
        throw new Error('[GeaFFI] Pointer/string fields require a native Pointer.');
      }
      return;
    }
    switch (type) {
      case 'bool': koffi.encode(address, 'uint8', value ? 1 : 0); return;
      case 'int8': koffi.encode(address, 'int8', Number(value)); return;
      case 'uint8': koffi.encode(address, 'uint8', Number(value)); return;
      case 'int16': koffi.encode(address, 'int16', Number(value)); return;
      case 'uint16': koffi.encode(address, 'uint16', Number(value)); return;
      case 'int32': koffi.encode(address, 'int32', Number(value)); return;
      case 'uint32': koffi.encode(address, 'uint32', Number(value)); return;
      case 'int64': koffi.encode(address, 'int64', BigInt(value as bigint)); return;
      case 'uint64': koffi.encode(address, 'uint64', BigInt(value as bigint)); return;
      case 'float': koffi.encode(address, 'float', Number(value)); return;
      case 'double': koffi.encode(address, 'double', Number(value)); return;
      default: throw new Error(`[GeaFFI] Unsupported struct field type '${type}'.`);
    }
  }

  toObject(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const fieldName of Object.keys(this.definition.fields)) result[fieldName] = this.get(fieldName);
    return result;
  }

  assign(values: Record<string, unknown>): void {
    for (const [fieldName, value] of Object.entries(values)) {
      if (fieldName in this.definition.fields && value !== undefined) this.set(fieldName, value);
    }
  }

  free(): void {
    if (!this.owned) return;
    this.owned = false;
    NativeMemory.free(this.pointer);
  }}
