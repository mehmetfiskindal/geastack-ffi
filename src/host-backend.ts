// SPDX-License-Identifier: Apache-2.0
/**
 * Host shared-library backend.
 * Loads a real dynamic library and calls exported C functions.
 */

import koffi, { type LibraryHandle, type TypeObject } from 'koffi';
import { Pointer } from './memory.js';
import { adoptNativePointer, requireNativeAddress } from './native-pointers.js';
import { StructDefinition, StructInstance } from './struct.js';
import { CallbackDefinition, FFIType, FunctionDescriptor } from './types.js';

type HostType = string | TypeObject | ReturnType<typeof koffi.inout>;
type HostFunction = (...args: unknown[]) => unknown;

export type LibraryFunctions = Record<string, FunctionDescriptor>;

export interface NativeCallBinding {
  invoke(symbolName: string, descriptor: FunctionDescriptor, args: readonly unknown[]): unknown;
  symbolAddress(symbolName: string): Pointer;
  close(): void;
  moduleAddress: Pointer;
}

const structTypes = new WeakMap<StructDefinition, TypeObject>();
const callbackTypes = new WeakMap<CallbackDefinition, TypeObject>();

/** A registered persistent callback; call release() when the native side is done. */
export class CallbackHandle {
  private released = false;

  constructor(readonly definition: CallbackDefinition, readonly handle: bigint) {}

  release(): void {
    if (this.released) return;
    this.released = true;
    koffi.unregister(this.handle);
  }
}

export function createCallback(
  definition: CallbackDefinition,
  callback: (...args: unknown[]) => unknown
): CallbackHandle {
  if (!definition.persistent) {
    throw new Error('[GeaFFI] createCallback requires defineCallback(..., { persistent: true }).');
  }
  if (typeof callback !== 'function') {
    throw new Error('[GeaFFI] createCallback expects a JavaScript function.');
  }
  const type = toKoffiType(definition, 'arg');
  const handle = koffi.register(callback, type);
  return new CallbackHandle(definition, handle);
}

function declaredSymbol(name: string, descriptor: FunctionDescriptor): string {
  return descriptor.symbol || name;
}

function toNativeAddress(pointer: Pointer): bigint | null {
  return requireNativeAddress(pointer, 'Pointer');
}

/**
 * Read a native 32-bit integer through a pointer returned by a native call.
 * Used for helpers such as `__errno_location` that return an int pointer.
 */
export function readNativeInt32(pointer: Pointer): number {
  if (pointer.isNull()) return 0;
  const address = requireNativeAddress(pointer, 'Pointer');
  return Number(koffi.decode(address as bigint, 'int32'));
}

function toKoffiPrimitive(type: FFIType): HostType {
  if (typeof type !== 'string') {
    throw new Error('[GeaFFI] Expected a primitive FFI type.');
  }
  switch (type) {
    case 'void':
      return 'void';
    case 'bool':
      return 'bool';
    case 'int8':
      return 'int8';
    case 'uint8':
      return 'uint8';
    case 'int16':
      return 'int16';
    case 'uint16':
      return 'uint16';
    case 'int32':
      return 'int32';
    case 'uint32':
      return 'uint32';
    case 'int64':
      return 'int64';
    case 'uint64':
      return 'uint64';
    case 'float':
      return 'float';
    case 'double':
      return 'double';
    case 'pointer':
    case 'buffer':
      return 'void *';
    case 'string':
      return 'str';
    case 'wstring':
      return 'str16';
    default:
      throw new Error(`[GeaFFI] Unsupported primitive FFI type '${type}'.`);
  }
}

function koffiStruct(definition: StructDefinition): TypeObject {
  const cached = structTypes.get(definition);
  if (cached) return cached;

  const fields: Record<string, HostType> = {};
  for (const [name, field] of Object.entries(definition.fields)) {
    fields[name] = toKoffiType(field.type, 'field');
  }

  const type = koffi.struct(fields);
  const hostSize = koffi.sizeof(type);
  if (hostSize !== definition.size) {
    throw new Error(
      `[GeaFFI] Struct '${definition.name}' is ${definition.size} bytes, but the host ABI layout is ${hostSize} bytes.`
    );
  }
  for (const [name, field] of Object.entries(definition.fields)) {
    const hostOffset = koffi.offsetof(type, name);
    if (hostOffset !== field.offset) {
      throw new Error(
        `[GeaFFI] Struct '${definition.name}.${name}' is at offset ${field.offset}, but the host ABI offset is ${hostOffset}.`
      );
    }
  }

  structTypes.set(definition, type);
  return type;
}

function toKoffiType(type: FFIType, direction: 'arg' | 'return' | 'field'): HostType {
  if (typeof type === 'string') {
    return toKoffiPrimitive(type);
  }
  if (type instanceof StructDefinition) {
    const structType = koffiStruct(type);
    if (direction === 'arg') {
      return koffi.inout(koffi.pointer(structType));
    }
    return structType;
  }
  if (type.__isCallback) {
    const cached = callbackTypes.get(type);
    if (cached) return koffi.pointer(cached);
    const proto = koffi.proto(
      null,
      toKoffiType(type.returns, 'return'),
      type.args.map((argument) => toKoffiType(argument, 'arg'))
    );
    callbackTypes.set(type, proto);
    return koffi.pointer(proto);
  }
  throw new Error('[GeaFFI] Unsupported native type.');
}

function marshalArg(type: FFIType, value: unknown): { value: unknown; writeBack?: () => void } {
  if (typeof type !== 'string' && '__isCallback' in type) {
    if (type.persistent) {
      if (value === null || value === undefined) return { value: null };
      if (!(value instanceof CallbackHandle)) {
        throw new Error('[GeaFFI] Persistent callback arguments must be CallbackHandle values from createCallback().');
      }
      if (value.definition !== type) {
        throw new Error('[GeaFFI] CallbackHandle was created for a different callback definition.');
      }
      return { value: value.handle };
    }
    if (typeof value !== 'function') {
      throw new Error('[GeaFFI] Callback arguments must be JavaScript functions.');
    }
    return { value };
  }
  if (type instanceof StructDefinition) {
    if (value instanceof StructInstance) {
      const snapshot = value.toObject();
      return {
        value: snapshot,
        writeBack: () => value.assign(snapshot),
      };
    }
    if (value instanceof Pointer) {
      return { value: toNativeAddress(value) };
    }
    if (value === null || value === undefined) {
      return { value: null };
    }
    if (typeof value === 'object') {
      return { value };
    }
    throw new Error(`[GeaFFI] Struct '${type.name}' argument must be a struct instance or object.`);
  }

  if (type === 'pointer') {
    if (value === null || value === undefined) return { value: null };
    if (value instanceof Pointer) return { value: toNativeAddress(value) };
    throw new Error('[GeaFFI] Pointer arguments must be Pointer values returned by a native call, or null.');
  }

  if (type === 'string' || type === 'wstring') {
    if (value === null || value === undefined) return { value: null };
    if (typeof value !== 'string') {
      throw new Error(`[GeaFFI] Expected a JavaScript string for '${type}'.`);
    }
    return { value };
  }

  if (type === 'buffer') {
    if (value === null || value === undefined) return { value: null };
    if (value instanceof Uint8Array || value instanceof Pointer) {
      if (value instanceof Pointer) return { value: toNativeAddress(value) };
      return { value };
    }
    throw new Error('[GeaFFI] Buffer arguments must be Uint8Array or a native Pointer.');
  }

  return { value };
}

function marshalReturn(type: FFIType, value: unknown): unknown {
  if (type === 'void') return undefined;
  if (type === 'int64' || type === 'uint64') {
    return typeof value === 'bigint' ? value : BigInt(value as number);
  }
  if (type === 'pointer') {
    if (value === null || value === undefined) return Pointer.NULL;
    return adoptNativePointer(value as bigint | number);
  }
  if (type === 'bool') return Boolean(value);
  return value;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function openNativeLibrary(libraryPath: string, functions: LibraryFunctions): NativeCallBinding {
  let library: LibraryHandle;
  try {
    library = koffi.load(libraryPath);
  } catch (error) {
    throw new Error(`[GeaFFI] Failed to load shared library '${libraryPath}': ${errorMessage(error)}`);
  }

  const bound = new Map<string, HostFunction>();
  try {
    for (const [name, descriptor] of Object.entries(functions)) {
      const symbolName = declaredSymbol(name, descriptor);
      const result = toKoffiType(descriptor.returns, 'return');
      const args = descriptor.args.map((arg) => toKoffiType(arg, 'arg'));
      const convention = descriptor.abi === 'stdcall' || descriptor.abi === 'cdecl' || descriptor.abi === 'fastcall'
        ? descriptor.abi
        : undefined;
      const fn = convention
        ? library.func(convention, symbolName, result, args)
        : library.func(symbolName, result, args);
      bound.set(symbolName, fn);
    }
  } catch (error) {
    try {
      library.unload();
    } catch {
      // The original resolution error is the one to report.
    }
    throw new Error(`[GeaFFI] Symbol was not found in '${libraryPath}': ${errorMessage(error)}`);
  }

  const firstEntry = Object.entries(functions)[0];
  const moduleAddress = firstEntry
    ? adoptNativePointer(koffi.address(library.symbol(declaredSymbol(firstEntry[0], firstEntry[1]))))
    : Pointer.NULL;

  let closed = false;

  return {
    moduleAddress,
    invoke(symbolName, _descriptor, args) {
      if (closed) {
        throw new Error(`[GeaFFI] Cannot call '${symbolName}': Library '${libraryPath}' is closed.`);
      }
      const fn = bound.get(symbolName);
      if (!fn) {
        throw new Error(`[GeaFFI] Symbol '${symbolName}' is not bound in '${libraryPath}'.`);
      }
      const marshaled = args.map((value, index) => marshalArg(_descriptor.args[index], value));
      const result = fn(...marshaled.map((entry) => entry.value));
      for (const entry of marshaled) {
        entry.writeBack?.();
      }
      return marshalReturn(_descriptor.returns, result);
    },
    symbolAddress(symbolName) {
      if (closed) {
        throw new Error(`[GeaFFI] Library '${libraryPath}' is closed.`);
      }
      return adoptNativePointer(koffi.address(library.symbol(symbolName)));
    },
    close() {
      if (closed) return;
      closed = true;
      library.unload();
    },
  };
}
