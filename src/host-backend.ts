// SPDX-License-Identifier: Apache-2.0
/**
 * Host shared-library backend.
 * Loads a real dynamic library and calls exported C functions.
 */

import koffi, { type LibraryHandle, type TypeObject } from 'koffi';
import { Pointer } from './memory.js';
import { NativeStructInstance } from './native-memory.js';
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

  /** True once release() unregistered the underlying koffi slot. */
  isReleased(): boolean {
    return this.released;
  }

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
  const handle = koffi.register(wrapCallback(definition, callback), type);
  return new CallbackHandle(definition, handle);
}

function declaredSymbol(name: string, descriptor: FunctionDescriptor): string {
  return descriptor.symbol || name;
}

const HOST_CALLING_CONVENTIONS = new Set<string>(['cdecl', 'stdcall', 'fastcall']);

/**
 * Reject descriptor options the host backend cannot honour.
 * Silently ignoring them is worse than failing: a caller that asks for an
 * asynchronous call or a different ABI would get a synchronous call with the
 * default ABI and never notice.
 */
function assertHostDescriptor(name: string, descriptor: FunctionDescriptor): void {
  if (descriptor.async) {
    throw new Error(
      `[GeaFFI] '${name}' sets descriptor.async, but the host backend only performs synchronous calls.`
    );
  }
  if (descriptor.abi && !HOST_CALLING_CONVENTIONS.has(descriptor.abi)) {
    throw new Error(
      `[GeaFFI] '${name}' requests the '${descriptor.abi}' calling convention, which the host backend does not support.`
    );
  }
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

function marshalStructObject(
  definition: StructDefinition,
  source: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [fieldName, field] of Object.entries(definition.fields)) {
    const fieldType = field.type;
    const fieldValue = source[fieldName];
    const label = `Struct '${definition.name}.${fieldName}'`;

    if (fieldType instanceof StructDefinition) {
      if (fieldValue instanceof StructInstance || fieldValue instanceof NativeStructInstance) {
        result[fieldName] = marshalStructObject(fieldType, fieldValue.toObject());
      } else if (fieldValue && typeof fieldValue === 'object') {
        result[fieldName] = marshalStructObject(fieldType, fieldValue as Record<string, unknown>);
      } else if (fieldValue !== undefined) {
        throw new Error(`[GeaFFI] ${label} expects a struct object.`);
      }
      continue;
    }

    if (typeof fieldType !== 'string' && '__isCallback' in fieldType) {
      if (fieldValue === null || fieldValue === undefined) {
        result[fieldName] = null;
      } else if (fieldValue instanceof CallbackHandle) {
        if (fieldValue.isReleased()) {
          throw new Error(`[GeaFFI] ${label} received a released CallbackHandle.`);
        }
        result[fieldName] = fieldValue.handle;
      } else if (fieldValue instanceof Pointer) {
        result[fieldName] = requireNativeAddress(fieldValue, label);
      } else {
        throw new Error(`[GeaFFI] ${label} requires a CallbackHandle, native Pointer, or null.`);
      }
      continue;
    }

    if (fieldType === 'pointer') {
      if (fieldValue === null || fieldValue === undefined) {
        result[fieldName] = null;
      } else if (fieldValue instanceof Pointer) {
        result[fieldName] = requireNativeAddress(fieldValue, label);
      } else {
        throw new Error(`[GeaFFI] ${label} requires a native Pointer or null.`);
      }
      continue;
    }

    if (fieldType === 'buffer') {
      if (fieldValue === null || fieldValue === undefined) {
        result[fieldName] = null;
      } else if (fieldValue instanceof Pointer) {
        result[fieldName] = requireNativeAddress(fieldValue, label);
      } else if (fieldValue instanceof Uint8Array) {
        result[fieldName] = fieldValue;
      } else {
        throw new Error(`[GeaFFI] ${label} requires a Uint8Array, native Pointer, or null.`);
      }
      continue;
    }

    if (fieldType === 'string' || fieldType === 'wstring') {
      if (fieldValue === null || fieldValue === undefined) {
        result[fieldName] = null;
      } else if (typeof fieldValue === 'string') {
        result[fieldName] = fieldValue;
      } else {
        throw new Error(`[GeaFFI] ${label} expects a JavaScript string or null.`);
      }
      continue;
    }

    if (fieldValue !== undefined) {
      result[fieldName] = fieldValue;
    }
  }
  return result;
}

function unmarshalStructObject(
  definition: StructDefinition,
  raw: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [fieldName, field] of Object.entries(definition.fields)) {
    const fieldType = field.type;
    const rawValue = raw[fieldName];
    if (fieldType instanceof StructDefinition) {
      result[fieldName] =
        rawValue && typeof rawValue === 'object'
          ? unmarshalStructObject(fieldType, rawValue as Record<string, unknown>)
          : rawValue;
      continue;
    }
    if (typeof fieldType !== 'string' && '__isCallback' in fieldType) {
      result[fieldName] =
        rawValue === null || rawValue === undefined
          ? Pointer.NULL
          : adoptNativePointer(rawValue as bigint | number);
      continue;
    }
    if (fieldType === 'pointer' || fieldType === 'buffer') {
      result[fieldName] =
        rawValue === null || rawValue === undefined
          ? Pointer.NULL
          : adoptNativePointer(rawValue as bigint | number);
      continue;
    }
    if (fieldType === 'int64' || fieldType === 'uint64') {
      result[fieldName] = typeof rawValue === 'bigint' ? rawValue : BigInt((rawValue ?? 0) as number);
      continue;
    }
    if (fieldType === 'bool') {
      result[fieldName] = Boolean(rawValue);
      continue;
    }
    result[fieldName] = rawValue;
  }
  return result;
}

function marshalCallbackArg(type: FFIType, raw: unknown): unknown {
  if (type === 'pointer' || type === 'buffer') {
    if (raw === null || raw === undefined) return Pointer.NULL;
    return adoptNativePointer(raw as bigint | number);
  }
  if (type === 'int64' || type === 'uint64') {
    return typeof raw === 'bigint' ? raw : BigInt(raw as number);
  }
  if (type === 'bool') return Boolean(raw);
  if (type instanceof StructDefinition) {
    if (raw === null || raw === undefined) return null;
    if (typeof raw === 'object') {
      return unmarshalStructObject(type, raw as Record<string, unknown>);
    }
  }
  return raw;
}

function marshalCallbackReturn(type: FFIType, value: unknown): unknown {
  if (type === 'void') return undefined;
  if (type === 'pointer') {
    if (value === null || value === undefined) return null;
    if (value instanceof Pointer) return toNativeAddress(value);
    throw new Error('[GeaFFI] Callback returning pointer must return a native Pointer or null.');
  }
  if (type === 'buffer') {
    if (value === null || value === undefined) return null;
    if (value instanceof Pointer) return toNativeAddress(value);
    if (value instanceof Uint8Array) return value;
    throw new Error('[GeaFFI] Callback returning buffer must return a Uint8Array, native Pointer, or null.');
  }
  if (type instanceof StructDefinition) {
    if (value instanceof StructInstance || value instanceof NativeStructInstance) {
      return marshalStructObject(type, value.toObject());
    }
    if (value && typeof value === 'object') {
      return marshalStructObject(type, value as Record<string, unknown>);
    }
    throw new Error(`[GeaFFI] Callback returning struct '${type.name}' must return a struct object.`);
  }
  if (type === 'int64' || type === 'uint64') {
    return typeof value === 'bigint' ? value : BigInt(value as number);
  }
  if (type === 'bool') return Boolean(value);
  return value;
}

function wrapCallback(
  definition: CallbackDefinition,
  callback: (...args: unknown[]) => unknown
): (...args: unknown[]) => unknown {
  return (...rawArgs: unknown[]) => {
    const converted = definition.args.map((argType, index) => marshalCallbackArg(argType, rawArgs[index]));
    const result = callback(...converted);
    return marshalCallbackReturn(definition.returns, result);
  };
}

function marshalArg(type: FFIType, value: unknown): { value: unknown; writeBack?: () => void } {
  if (typeof type !== 'string' && '__isCallback' in type) {
    if (type.persistent) {
      if (value === null || value === undefined) return { value: null };
      if (!(value instanceof CallbackHandle)) {
        throw new Error('[GeaFFI] Persistent callback arguments must be CallbackHandle values from createCallback().');
      }
      if (value.isReleased()) {
        throw new Error('[GeaFFI] This CallbackHandle was already released; create a new one with createCallback().');
      }
      if (value.definition !== type) {
        throw new Error('[GeaFFI] CallbackHandle was created for a different callback definition.');
      }
      return { value: value.handle };
    }
    if (value === null || value === undefined) return { value: null };
    if (typeof value !== 'function') {
      throw new Error('[GeaFFI] Callback arguments must be JavaScript functions.');
    }
    return { value: wrapCallback(type, value as (...args: unknown[]) => unknown) };
  }
  if (type instanceof StructDefinition) {
    if (value instanceof NativeStructInstance) {
      if (value.definition !== type) {
        throw new Error(
          `[GeaFFI] NativeStructInstance '${value.definition.name}' does not match expected struct '${type.name}'.`
        );
      }
      return { value: toNativeAddress(value.pointer) };
    }
    if (value instanceof StructInstance) {
      const snapshot = marshalStructObject(type, value.toObject());
      return {
        value: snapshot,
        writeBack: () => value.assign(unmarshalStructObject(type, snapshot)),
      };
    }
    if (value instanceof Pointer) {
      return { value: toNativeAddress(value) };
    }
    if (value === null || value === undefined) {
      return { value: null };
    }
    if (typeof value === 'object') {
      const source = value as Record<string, unknown>;
      const snapshot = marshalStructObject(type, source);
      return {
        value: snapshot,
        writeBack: () => {
          const updated = unmarshalStructObject(type, snapshot);
          for (const key of Object.keys(type.fields)) {
            if (key in updated) source[key] = updated[key];
          }
        },
      };
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
  if (type instanceof StructDefinition && value && typeof value === 'object') {
    return unmarshalStructObject(type, value as Record<string, unknown>);
  }
  return value;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function openNativeLibrary(libraryPath: string, functions: LibraryFunctions): NativeCallBinding {
  for (const [name, descriptor] of Object.entries(functions)) {
    assertHostDescriptor(name, descriptor);
  }

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
      bound.set(name, fn);
    }
  } catch (error) {
    try {
      library.unload();
    } catch {
      // The original resolution error is the one to report.
    }
    throw new Error(`[GeaFFI] Symbol was not found in '${libraryPath}': ${errorMessage(error)}`);
  }

  let moduleAddress: Pointer = Pointer.NULL;
  const firstEntry = Object.entries(functions)[0];
  if (firstEntry) {
    try {
      moduleAddress = adoptNativePointer(koffi.address(library.symbol(declaredSymbol(firstEntry[0], firstEntry[1]))));
    } catch (error) {
      try {
        library.unload();
      } catch {
        // Report the original error.
      }
      throw error;
    }
  }

  let closed = false;

  return {
    moduleAddress,
    invoke(bindingName, _descriptor, args) {
      if (closed) {
        throw new Error(`[GeaFFI] Cannot call '${bindingName}': Library '${libraryPath}' is closed.`);
      }
      const fn = bound.get(bindingName);
      if (!fn) {
        throw new Error(`[GeaFFI] Symbol '${bindingName}' is not bound in '${libraryPath}'.`);
      }
      if (args.length !== _descriptor.args.length) {
        throw new Error(
          `[GeaFFI] '${bindingName}' expects ${_descriptor.args.length} argument(s), got ${args.length}.`
        );
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
