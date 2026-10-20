// SPDX-License-Identifier: Apache-2.0
/**
 * Host shared-library backend.
 * Loads a real dynamic library and calls exported C functions.
 */
import koffi from 'koffi';
import { Pointer } from './memory.js';
import { StructDefinition, StructInstance } from './struct.js';
const nativePointers = new WeakSet();
const structTypes = new WeakMap();
function declaredSymbol(name, descriptor) {
    return descriptor.symbol || name;
}
function pointerFromAddress(address) {
    const value = BigInt(address);
    if (value === 0n)
        return Pointer.NULL;
    return new Pointer(value);
}
function adoptNativePointer(address) {
    const pointer = pointerFromAddress(address);
    if (!pointer.isNull()) {
        nativePointers.add(pointer);
    }
    return pointer;
}
function toNativeAddress(pointer) {
    if (pointer.isNull())
        return null;
    if (!nativePointers.has(pointer)) {
        throw new Error(`[GeaFFI] Pointer ${pointer.toHex()} is a simulated heap address and cannot be passed to a native function.`);
    }
    return pointer.address;
}
function toKoffiPrimitive(type) {
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
function koffiStruct(definition) {
    const cached = structTypes.get(definition);
    if (cached)
        return cached;
    const fields = {};
    for (const [name, field] of Object.entries(definition.fields)) {
        fields[name] = toKoffiType(field.type, 'field');
    }
    const type = koffi.struct(fields);
    const hostSize = koffi.sizeof(type);
    if (hostSize !== definition.size) {
        throw new Error(`[GeaFFI] Struct '${definition.name}' is ${definition.size} bytes, but the host ABI layout is ${hostSize} bytes.`);
    }
    for (const [name, field] of Object.entries(definition.fields)) {
        const hostOffset = koffi.offsetof(type, name);
        if (hostOffset !== field.offset) {
            throw new Error(`[GeaFFI] Struct '${definition.name}.${name}' is at offset ${field.offset}, but the host ABI offset is ${hostOffset}.`);
        }
    }
    structTypes.set(definition, type);
    return type;
}
function toKoffiType(type, direction) {
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
    throw new Error('[GeaFFI] Callback types are not supported by the host native backend.');
}
function marshalArg(type, value) {
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
        if (value === null || value === undefined)
            return { value: null };
        if (value instanceof Pointer)
            return { value: toNativeAddress(value) };
        throw new Error('[GeaFFI] Pointer arguments must be Pointer values returned by a native call, or null.');
    }
    if (type === 'string' || type === 'wstring') {
        if (value === null || value === undefined)
            return { value: null };
        if (typeof value !== 'string') {
            throw new Error(`[GeaFFI] Expected a JavaScript string for '${type}'.`);
        }
        return { value };
    }
    if (type === 'buffer') {
        if (value === null || value === undefined)
            return { value: null };
        if (value instanceof Uint8Array || value instanceof Pointer) {
            if (value instanceof Pointer)
                return { value: toNativeAddress(value) };
            return { value };
        }
        throw new Error('[GeaFFI] Buffer arguments must be Uint8Array or a native Pointer.');
    }
    return { value };
}
function marshalReturn(type, value) {
    if (type === 'void')
        return undefined;
    if (type === 'int64' || type === 'uint64') {
        return typeof value === 'bigint' ? value : BigInt(value);
    }
    if (type === 'pointer') {
        if (value === null || value === undefined)
            return Pointer.NULL;
        return adoptNativePointer(value);
    }
    if (type === 'bool')
        return Boolean(value);
    return value;
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
export function openNativeLibrary(libraryPath, functions) {
    let library;
    try {
        library = koffi.load(libraryPath);
    }
    catch (error) {
        throw new Error(`[GeaFFI] Failed to load shared library '${libraryPath}': ${errorMessage(error)}`);
    }
    const bound = new Map();
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
    }
    catch (error) {
        try {
            library.unload();
        }
        catch {
            // The original resolution error is the one to report.
        }
        throw new Error(`[GeaFFI] Symbol was not found in '${libraryPath}': ${errorMessage(error)}`);
    }
    const firstEntry = Object.entries(functions)[0];
    const moduleAddress = firstEntry
        ? pointerFromAddress(koffi.address(library.symbol(declaredSymbol(firstEntry[0], firstEntry[1]))))
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
            return pointerFromAddress(koffi.address(library.symbol(symbolName)));
        },
        close() {
            if (closed)
                return;
            closed = true;
            library.unload();
        },
    };
}
//# sourceMappingURL=host-backend.js.map