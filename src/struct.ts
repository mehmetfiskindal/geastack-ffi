// SPDX-License-Identifier: Apache-2.0
/**
 * @geastack/ffi - C Struct Layout and Serialization
 * Computes standard C ABI alignment, padding, and field offsets.
 */

import {
  FFIType,
  PrimitiveType,
  PRIMITIVE_ALIGNMENTS,
  PRIMITIVE_SIZES,
  StructField,
} from './types.js';
import { Memory, Pointer } from './memory.js';

export interface StructLayoutField {
  readonly name: string;
  readonly type: FFIType;
  readonly size: number;
  readonly alignment: number;
  readonly offset: number;
}

/**
 * Resolves the byte size and alignment requirements for an FFI type.
 */
export function getTypeInfo(type: FFIType): { size: number; alignment: number } {
  if (typeof type === 'string') {
    return {
      size: PRIMITIVE_SIZES[type],
      alignment: PRIMITIVE_ALIGNMENTS[type],
    };
  }
  if (type instanceof StructDefinition) {
    return {
      size: type.size,
      alignment: type.alignment,
    };
  }
  // Callbacks are function pointers (size of pointer)
  return {
    size: PRIMITIVE_SIZES['pointer'],
    alignment: PRIMITIVE_ALIGNMENTS['pointer'],
  };
}

/**
 * Computes C-compatible ABI struct layout with alignment padding.
 */
export function computeStructLayout(
  fields: Record<string, FFIType>
): {
  layout: Record<string, StructLayoutField>;
  totalSize: number;
  maxAlignment: number;
} {
  let currentOffset = 0;
  let maxAlignment = 1;
  const layout: Record<string, StructLayoutField> = {};

  for (const [name, type] of Object.entries(fields)) {
    const { size, alignment } = getTypeInfo(type);
    if (alignment > maxAlignment) {
      maxAlignment = alignment;
    }

    // Align currentOffset to field's alignment: offset = ceil(offset / alignment) * alignment
    const remainder = currentOffset % alignment;
    if (remainder !== 0) {
      currentOffset += alignment - remainder;
    }

    layout[name] = {
      name,
      type,
      size,
      alignment,
      offset: currentOffset,
    };

    currentOffset += size;
  }

  // The total struct size must be padded to a multiple of maxAlignment
  const tailRemainder = currentOffset % maxAlignment;
  const totalSize = tailRemainder === 0 ? currentOffset : currentOffset + (maxAlignment - tailRemainder);

  return {
    layout,
    totalSize,
    maxAlignment,
  };
}

/**
 * High-level typed struct instance wrapping native memory.
 */
export class StructInstance {
  readonly definition: StructDefinition;
  readonly pointer: Pointer;

  constructor(definition: StructDefinition, pointer: Pointer) {
    this.definition = definition;
    this.pointer = pointer;
  }

  /**
   * Read a field value from struct memory.
   */
  get(fieldName: string): any {
    const field = this.definition.fields[fieldName];
    if (!field || field.offset === undefined) {
      throw new Error(`[GeaFFI] Field '${fieldName}' does not exist on struct '${this.definition.name}'`);
    }

    const fieldPtr = this.pointer.offset(field.offset);
    return readValue(fieldPtr, field.type);
  }

  /**
   * Write a field value to struct memory.
   */
  set(fieldName: string, value: any): void {
    const field = this.definition.fields[fieldName];
    if (!field || field.offset === undefined) {
      throw new Error(`[GeaFFI] Field '${fieldName}' does not exist on struct '${this.definition.name}'`);
    }

    const fieldPtr = this.pointer.offset(field.offset);
    writeValue(fieldPtr, field.type, value);
  }

  /**
   * Unpack the entire struct into a plain TypeScript JavaScript object.
   */
  toObject(): Record<string, any> {
    const obj: Record<string, any> = {};
    for (const key of Object.keys(this.definition.fields)) {
      obj[key] = this.get(key);
    }
    return obj;
  }

  /**
   * Populate struct fields from a plain JavaScript object.
   */
  assign(values: Record<string, any>): void {
    const fields = this.definition.fields;
    for (const key of Object.keys(values)) {
      if (key in fields && values[key] !== undefined) {
        this.set(key, values[key]);
      }
    }
  }

  /**
   * Free the struct's allocated memory.
   */
  free(): void {
    Memory.free(this.pointer);
  }
}

export class StructDefinition {
  readonly __isStruct = true as const;
  readonly name: string;
  readonly fields: Record<string, StructField>;
  readonly size: number;
  readonly alignment: number;

  constructor(
    name: string,
    fields: Record<string, StructField>,
    size: number,
    alignment: number
  ) {
    this.name = name;
    this.fields = fields;
    this.size = size;
    this.alignment = alignment;
  }

  alloc(initial?: Record<string, any>): StructInstance {
    const ptr = Memory.alloc(this.size);
    const instance = new StructInstance(this, ptr);
    if (initial) {
      instance.assign(initial);
    }
    return instance;
  }

  fromPointer(pointer: Pointer): StructInstance {
    return new StructInstance(this, pointer);
  }
}

export { StructDefinition as BindableStruct };

/**
 * Creates a strongly typed C Struct Definition.
 *
 * @example
 * ```ts
 * const Point = defineStruct('Point', {
 *   x: 'int32',
 *   y: 'int32',
 *   label: 'string',
 * });
 *
 * const pt = Point.alloc({ x: 10, y: 20, label: 'Origin' });
 * console.log(pt.get('x'), pt.get('label'));
 * pt.free();
 * ```
 */
export function defineStruct(
  name: string,
  fields: Record<string, FFIType>
): StructDefinition {
  const { layout, totalSize, maxAlignment } = computeStructLayout(fields);

  const resolvedFields: Record<string, StructField> = {};
  for (const [key, f] of Object.entries(layout)) {
    resolvedFields[key] = {
      type: f.type,
      offset: f.offset,
    };
  }

  return new StructDefinition(name, resolvedFields, totalSize, maxAlignment);
}

function readValue(pointer: Pointer, type: FFIType): any {
  if (typeof type === 'string') {
    return Memory.readPrimitive(pointer, type as PrimitiveType);
  }
  if (type instanceof StructDefinition) {
    const subInstance = new StructInstance(type, pointer);
    return subInstance.toObject();
  }
  // Callback or pointer
  return Memory.readPointer(pointer);
}

function writeValue(pointer: Pointer, type: FFIType, value: any): void {
  if (typeof type === 'string') {
    Memory.writePrimitive(pointer, type as PrimitiveType, value);
    return;
  }
  if (type instanceof StructDefinition) {
    const subInstance = new StructInstance(type, pointer);
    if (typeof value === 'object' && value !== null) {
      subInstance.assign(value);
    }
    return;
  }
  if (value instanceof Pointer) {
    Memory.writePointer(pointer, value);
  } else {
    Memory.writePointer(pointer, new Pointer(value ?? 0n));
  }
}
