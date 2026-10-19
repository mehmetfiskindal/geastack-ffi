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
  StructDefinition,
  StructField,
  FFITypeToTypeScript,
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
  if ('__isStruct' in type) {
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
export function computeStructLayout<TFields extends Record<string, FFIType>>(
  fields: TFields
): {
  layout: Record<keyof TFields, StructLayoutField>;
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
    layout: layout as Record<keyof TFields, StructLayoutField>,
    totalSize,
    maxAlignment,
  };
}

/**
 * High-level typed struct instance wrapping native memory.
 */
export class StructInstance<TFields extends Record<string, FFIType>> {
  readonly definition: StructDefinition<TFields>;
  readonly pointer: Pointer;

  constructor(definition: StructDefinition<TFields>, pointer: Pointer) {
    this.definition = definition;
    this.pointer = pointer;
  }

  /**
   * Read a field value from struct memory.
   */
  get<K extends keyof TFields>(fieldName: K): FFITypeToTypeScript<TFields[K]> {
    const field = this.definition.fields[fieldName];
    if (!field || field.offset === undefined) {
      throw new Error(`[GeaFFI] Field '${String(fieldName)}' does not exist on struct '${this.definition.name}'`);
    }

    const fieldPtr = this.pointer.offset(field.offset);
    return readValue(fieldPtr, field.type);
  }

  /**
   * Write a field value to struct memory.
   */
  set<K extends keyof TFields>(fieldName: K, value: FFITypeToTypeScript<TFields[K]>): void {
    const field = this.definition.fields[fieldName];
    if (!field || field.offset === undefined) {
      throw new Error(`[GeaFFI] Field '${String(fieldName)}' does not exist on struct '${this.definition.name}'`);
    }

    const fieldPtr = this.pointer.offset(field.offset);
    writeValue(fieldPtr, field.type, value);
  }

  /**
   * Unpack the entire struct into a plain TypeScript JavaScript object.
   */
  toObject(): { [K in keyof TFields]: FFITypeToTypeScript<TFields[K]> } {
    const obj: any = {};
    for (const key of Object.keys(this.definition.fields)) {
      obj[key] = this.get(key as keyof TFields);
    }
    return obj;
  }

  /**
   * Populate struct fields from a plain JavaScript object.
   */
  assign(values: Partial<{ [K in keyof TFields]: FFITypeToTypeScript<TFields[K]> }>): void {
    for (const [key, value] of Object.entries(values)) {
      if (key in this.definition.fields && value !== undefined) {
        this.set(key as keyof TFields, value as any);
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
export function defineStruct<TFields extends Record<string, FFIType>>(
  name: string,
  fields: TFields
): StructDefinition<TFields> & {
  alloc(initial?: Partial<{ [K in keyof TFields]: FFITypeToTypeScript<TFields[K]> }>): StructInstance<TFields>;
  fromPointer(pointer: Pointer): StructInstance<TFields>;
} {
  const { layout, totalSize, maxAlignment } = computeStructLayout(fields);

  const resolvedFields: any = {};
  for (const [key, f] of Object.entries(layout)) {
    resolvedFields[key] = {
      type: f.type,
      offset: f.offset,
    };
  }

  const definition: StructDefinition<TFields> = {
    __isStruct: true,
    name,
    fields: resolvedFields,
    size: totalSize,
    alignment: maxAlignment,
  };

  const structObject = {
    ...definition,
    alloc(initial?: Partial<{ [K in keyof TFields]: FFITypeToTypeScript<TFields[K]> }>): StructInstance<TFields> {
      const ptr = Memory.alloc(totalSize);
      const instance = new StructInstance(definition, ptr);
      if (initial) {
        instance.assign(initial);
      }
      return instance;
    },
    fromPointer(pointer: Pointer): StructInstance<TFields> {
      return new StructInstance(definition, pointer);
    },
  };

  return structObject;
}

function readValue(pointer: Pointer, type: FFIType): any {
  if (typeof type === 'string') {
    return Memory.readPrimitive(pointer, type as PrimitiveType);
  }
  if ('__isStruct' in type) {
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
  if ('__isStruct' in type) {
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
