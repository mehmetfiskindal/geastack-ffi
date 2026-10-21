// SPDX-License-Identifier: Apache-2.0
/**
 * Koffi binding for the native libdbus bridge.
 *
 * The shared library is built by `npm run build:dbus-host`. When it is absent
 * (or libdbus is not installed), `nativeDBus` is null and the TypeScript DBus
 * helpers keep their in-process simulation.
 */
import koffi from 'koffi';
export const DBUS_KIND = {
    STRING: 1,
    OBJECT_PATH: 2,
    BOOLEAN: 3,
    INT32: 4,
    UINT32: 5,
    INT64: 6,
    UINT64: 7,
    DOUBLE: 8,
    EMPTY_ARRAY: 9,
    STRING_ARRAY: 10,
    BYTE_ARRAY: 11,
    DICT: 12,
    OBJECT_PATH_ARRAY: 13,
    STRING_DICT: 14,
    INT32_ARRAY: 15,
};
const DBusUnion = koffi.union({
    str: 'void *',
    b: 'uint8',
    i32: 'int32',
    u32: 'uint32',
    i64: 'int64',
    u64: 'uint64',
    d: 'double',
    array: 'void *',
    bytes: 'void *',
    dict: 'void *',
    stringDict: 'void *',
    int32Array: 'void *',
});
const DBusValue = koffi.struct({
    kind: 'int32',
    as: DBusUnion,
});
const VALUE_SIZE = koffi.sizeof(DBusValue);
const UNION_OFFSET = koffi.offsetof(DBusValue, 'as');
const DBusStringArray = koffi.struct({
    values: koffi.pointer('char *'),
    count: 'int32',
});
const DBusByteArray = koffi.struct({
    data: 'void *',
    count: 'int32',
});
const DBusProperty = koffi.struct({
    key: 'void *',
    value: DBusValue,
});
const DBusDictionary = koffi.struct({
    entries: 'void *',
    count: 'int32',
});
const DBusInt32Array = koffi.struct({
    values: 'void *',
    count: 'int32',
});
const DBusStringPair = koffi.struct({
    key: 'void *',
    value: 'void *',
});
const DBusStringDictionary = koffi.struct({
    entries: 'void *',
    count: 'int32',
});
const PROPERTY_SIZE = koffi.sizeof(DBusProperty);
const PROPERTY_VALUE_OFFSET = koffi.offsetof(DBusProperty, 'value');
const RESULT_CAPACITY = 8;
function candidatePaths() {
    const names = process.platform === 'darwin'
        ? ['libgea_ffi_dbus.dylib']
        : ['libgea_ffi_dbus.so'];
    const candidates = [];
    const configured = process.env.GEA_FFI_DBUS_LIBRARY;
    if (configured)
        candidates.push(configured);
    const base = `${process.cwd()}/build/dbus-native`;
    for (const name of names)
        candidates.push(`${base}/${name}`);
    return candidates;
}
function loadLibrary() {
    for (const libraryPath of candidatePaths()) {
        try {
            const lib = koffi.load(libraryPath);
            return {
                connect: lib.func('gea_ffi_dbus_connect', 'int32', ['int32', 'void **']),
                disconnect: lib.func('gea_ffi_dbus_disconnect', 'void', ['void *']),
                call: lib.func('gea_ffi_dbus_call', 'int32', [
                    'void *', 'const char *', 'const char *', 'const char *', 'const char *',
                    koffi.pointer(DBusValue), 'int32',
                    koffi.pointer(DBusValue), 'int32', koffi.pointer('int32'),
                ]),
                lastError: lib.func('gea_ffi_dbus_last_error', 'const char *', []),
                free: lib.func('gea_ffi_dbus_free', 'void', ['void *']),
                freeValue: lib.func('gea_ffi_dbus_free_value', 'void', ['void *']),
                uniqueName: lib.func('gea_ffi_dbus_unique_name', 'const char *', ['void *']),
                setProperty: lib.func('gea_ffi_dbus_set_property', 'int32', [
                    'void *', 'const char *', 'const char *', 'const char *', 'const char *', koffi.pointer(DBusValue),
                ]),
                addMatch: lib.func('gea_ffi_dbus_add_match', 'int32', ['void *', 'const char *']),
                removeMatch: lib.func('gea_ffi_dbus_remove_match', 'int32', ['void *', 'const char *']),
                callStringPropertiesUint: lib.func('gea_ffi_dbus_call_string_properties_uint', 'int32', [
                    'void *', 'const char *', 'const char *', 'const char *', 'const char *', 'const char *',
                    koffi.pointer(DBusProperty), 'int32', koffi.pointer('uint32'),
                ]),
                nextSignal: lib.func('gea_ffi_dbus_next_signal', 'int32', [
                    'void *', 'int32',
                    'char *', 'int32',
                    'char *', 'int32',
                    'char *', 'int32',
                    koffi.pointer(DBusValue), 'int32', koffi.pointer('int32'),
                ]),
            };
        }
        catch {
            // Try the next candidate path.
        }
    }
    return null;
}
export function dbusObjectPath(value) {
    return { kind: DBUS_KIND.OBJECT_PATH, value };
}
export function dbusBool(value) {
    return { kind: DBUS_KIND.BOOLEAN, value };
}
export function dbusInt32(value) {
    return { kind: DBUS_KIND.INT32, value };
}
export function dbusUint32(value) {
    return { kind: DBUS_KIND.UINT32, value };
}
export function dbusInt64(value) {
    return { kind: DBUS_KIND.INT64, value };
}
export function dbusUint64(value) {
    return { kind: DBUS_KIND.UINT64, value };
}
export function dbusDouble(value) {
    return { kind: DBUS_KIND.DOUBLE, value };
}
export function dbusStringArray(values) {
    return { kind: DBUS_KIND.STRING_ARRAY, value: values.map(String) };
}
export function dbusByteArray(values) {
    return { kind: DBUS_KIND.BYTE_ARRAY, value: Uint8Array.from(values) };
}
export function dbusDictionary(values) {
    return { kind: DBUS_KIND.DICT, value: { ...values } };
}
export function dbusObjectPathArray(values) {
    return { kind: DBUS_KIND.OBJECT_PATH_ARRAY, value: values.map(String) };
}
export function dbusStringDictionary(values) {
    return { kind: DBUS_KIND.STRING_DICT, value: { ...values } };
}
export function dbusInt32Array(values) {
    return { kind: DBUS_KIND.INT32_ARRAY, value: values.map((value) => value | 0) };
}
/** An empty D-Bus array argument; `value` is the element signature, e.g. `(sv)`. */
export function dbusEmptyArray(elementSignature) {
    return { kind: DBUS_KIND.EMPTY_ARRAY, value: elementSignature };
}
function isTyped(value) {
    return typeof value === 'object' && value !== null && 'kind' in value && 'value' in value;
}
function classify(value) {
    if (isTyped(value))
        return { kind: value.kind, value: value.value };
    if (typeof value === 'string')
        return { kind: DBUS_KIND.STRING, value };
    if (typeof value === 'boolean')
        return { kind: DBUS_KIND.BOOLEAN, value };
    if (Array.isArray(value))
        return { kind: DBUS_KIND.STRING_ARRAY, value: value.map(String) };
    if (value instanceof Uint8Array)
        return { kind: DBUS_KIND.BYTE_ARRAY, value: Uint8Array.from(value) };
    if (typeof value === 'object' && value !== null)
        return { kind: DBUS_KIND.DICT, value: value };
    if (typeof value === 'bigint') {
        return value < 0n
            ? { kind: DBUS_KIND.INT64, value }
            : { kind: DBUS_KIND.UINT64, value };
    }
    if (typeof value === 'number') {
        if (Number.isInteger(value) && value >= -2147483648 && value <= 2147483647) {
            return { kind: DBUS_KIND.INT32, value };
        }
        if (Number.isInteger(value) && value >= 0 && value <= 4294967295) {
            return { kind: DBUS_KIND.UINT32, value };
        }
        return { kind: DBUS_KIND.DOUBLE, value };
    }
    throw new Error(`[GeaFFI:DBus] Unsupported argument value ${String(value)}.`);
}
function allocCString(value) {
    const encoded = new TextEncoder().encode(value);
    const pointer = koffi.alloc('char', encoded.length + 1);
    koffi.encode(pointer, 'char', [...encoded, 0], encoded.length + 1);
    return pointer;
}
function decodeValue(pointer, index, backend, freeResult = true) {
    const base = index * VALUE_SIZE;
    const kind = Number(koffi.decode(pointer, base, 'int32'));
    switch (kind) {
        case DBUS_KIND.STRING:
        case DBUS_KIND.OBJECT_PATH: {
            const stringPointer = koffi.decode(pointer, base + UNION_OFFSET, 'void *');
            if (stringPointer === null || stringPointer === undefined || BigInt(stringPointer) === 0n)
                return '';
            const text = String(koffi.decode(stringPointer, 'char', -1));
            if (freeResult)
                backend.free(BigInt(stringPointer));
            return text;
        }
        case DBUS_KIND.BOOLEAN:
            return Number(koffi.decode(pointer, base + UNION_OFFSET, 'uint8')) !== 0;
        case DBUS_KIND.INT32:
            return Number(koffi.decode(pointer, base + UNION_OFFSET, 'int32'));
        case DBUS_KIND.UINT32:
            return Number(koffi.decode(pointer, base + UNION_OFFSET, 'uint32'));
        case DBUS_KIND.INT64:
            return BigInt(koffi.decode(pointer, base + UNION_OFFSET, 'int64'));
        case DBUS_KIND.UINT64:
            return BigInt(koffi.decode(pointer, base + UNION_OFFSET, 'uint64'));
        case DBUS_KIND.DOUBLE:
            return Number(koffi.decode(pointer, base + UNION_OFFSET, 'double'));
        case DBUS_KIND.INT32_ARRAY: {
            const arrayPointer = koffi.decode(pointer, base + UNION_OFFSET, 'void *');
            if (arrayPointer === null || arrayPointer === undefined || BigInt(arrayPointer) === 0n)
                return [];
            const valuesPointer = koffi.decode(BigInt(arrayPointer), koffi.offsetof(DBusInt32Array, 'values'), 'void *');
            const count = Number(koffi.decode(BigInt(arrayPointer), koffi.offsetof(DBusInt32Array, 'count'), 'int32'));
            const values = [];
            if (valuesPointer && count > 0) {
                for (let index = 0; index < count; index++) {
                    values.push(Number(koffi.decode(BigInt(valuesPointer), index * 4, 'int32')));
                }
            }
            if (freeResult)
                backend.freeValue(pointer + BigInt(base));
            return values;
        }
        case DBUS_KIND.STRING_ARRAY:
        case DBUS_KIND.OBJECT_PATH_ARRAY: {
            const arrayPointer = koffi.decode(pointer, base + UNION_OFFSET, 'void *');
            if (arrayPointer === null || arrayPointer === undefined || BigInt(arrayPointer) === 0n)
                return [];
            const valuesPointer = koffi.decode(BigInt(arrayPointer), koffi.offsetof(DBusStringArray, 'values'), 'void *');
            const count = Number(koffi.decode(BigInt(arrayPointer), koffi.offsetof(DBusStringArray, 'count'), 'int32'));
            const values = [];
            if (valuesPointer && count > 0) {
                for (let index = 0; index < count; index++) {
                    const stringPointer = koffi.decode(BigInt(valuesPointer), index * 8, 'void *');
                    values.push(stringPointer ? String(koffi.decode(BigInt(stringPointer), 'char', -1)) : '');
                }
            }
            if (freeResult)
                backend.freeValue(pointer + BigInt(base));
            return values;
        }
        case DBUS_KIND.BYTE_ARRAY: {
            const arrayPointer = koffi.decode(pointer, base + UNION_OFFSET, 'void *');
            if (arrayPointer === null || arrayPointer === undefined || BigInt(arrayPointer) === 0n)
                return new Uint8Array();
            const dataPointer = koffi.decode(BigInt(arrayPointer), koffi.offsetof(DBusByteArray, 'data'), 'void *');
            const count = Number(koffi.decode(BigInt(arrayPointer), koffi.offsetof(DBusByteArray, 'count'), 'int32'));
            const values = dataPointer && count > 0
                ? Uint8Array.from(koffi.decode(BigInt(dataPointer), 'uint8', count))
                : new Uint8Array();
            if (freeResult)
                backend.freeValue(pointer + BigInt(base));
            return values;
        }
        case DBUS_KIND.STRING_DICT: {
            const dictionaryPointer = koffi.decode(pointer, base + UNION_OFFSET, 'void *');
            if (dictionaryPointer === null || dictionaryPointer === undefined || BigInt(dictionaryPointer) === 0n)
                return {};
            const entriesPointer = koffi.decode(BigInt(dictionaryPointer), koffi.offsetof(DBusStringDictionary, 'entries'), 'void *');
            const count = Number(koffi.decode(BigInt(dictionaryPointer), koffi.offsetof(DBusStringDictionary, 'count'), 'int32'));
            const result = {};
            if (entriesPointer && count > 0) {
                for (let index = 0; index < count; index++) {
                    const entryOffset = index * koffi.sizeof(DBusStringPair);
                    const keyPointer = koffi.decode(BigInt(entriesPointer), entryOffset, 'void *');
                    const valuePointer = koffi.decode(BigInt(entriesPointer), entryOffset + koffi.offsetof(DBusStringPair, 'value'), 'void *');
                    const key = keyPointer ? String(koffi.decode(BigInt(keyPointer), 'char', -1)) : '';
                    result[key] = valuePointer ? String(koffi.decode(BigInt(valuePointer), 'char', -1)) : '';
                }
            }
            if (freeResult)
                backend.freeValue(pointer + BigInt(base));
            return result;
        }
        case DBUS_KIND.DICT: {
            const dictionaryPointer = koffi.decode(pointer, base + UNION_OFFSET, 'void *');
            if (dictionaryPointer === null || dictionaryPointer === undefined || BigInt(dictionaryPointer) === 0n)
                return {};
            const entriesPointer = koffi.decode(BigInt(dictionaryPointer), koffi.offsetof(DBusDictionary, 'entries'), 'void *');
            const count = Number(koffi.decode(BigInt(dictionaryPointer), koffi.offsetof(DBusDictionary, 'count'), 'int32'));
            const result = {};
            if (entriesPointer && count > 0) {
                for (let entryIndex = 0; entryIndex < count; entryIndex++) {
                    const entryOffset = entryIndex * PROPERTY_SIZE;
                    const keyPointer = koffi.decode(BigInt(entriesPointer), entryOffset, 'void *');
                    const key = keyPointer ? String(koffi.decode(BigInt(keyPointer), 'char', -1)) : '';
                    result[key] = decodeValue(BigInt(entriesPointer) + BigInt(entryOffset + PROPERTY_VALUE_OFFSET), 0, backend, false);
                }
            }
            if (freeResult)
                backend.freeValue(pointer + BigInt(base));
            return result;
        }
        default:
            throw new Error(`[GeaFFI:DBus] Unsupported reply kind ${kind}.`);
    }
}
function encodeEntry(pointer, offset, entry, strings) {
    koffi.encode(pointer, offset, 'int32', entry.kind);
    switch (entry.kind) {
        case DBUS_KIND.STRING:
        case DBUS_KIND.OBJECT_PATH: {
            const stringPointer = allocCString(String(entry.value));
            strings.push(stringPointer);
            koffi.encode(pointer, offset + UNION_OFFSET, 'void *', stringPointer);
            break;
        }
        case DBUS_KIND.BOOLEAN:
            koffi.encode(pointer, offset + UNION_OFFSET, 'uint8', entry.value ? 1 : 0);
            break;
        case DBUS_KIND.INT32:
            koffi.encode(pointer, offset + UNION_OFFSET, 'int32', Number(entry.value));
            break;
        case DBUS_KIND.UINT32:
            koffi.encode(pointer, offset + UNION_OFFSET, 'uint32', Number(entry.value));
            break;
        case DBUS_KIND.INT64:
            koffi.encode(pointer, offset + UNION_OFFSET, 'int64', BigInt(entry.value));
            break;
        case DBUS_KIND.UINT64:
            koffi.encode(pointer, offset + UNION_OFFSET, 'uint64', BigInt(entry.value));
            break;
        case DBUS_KIND.DOUBLE:
            koffi.encode(pointer, offset + UNION_OFFSET, 'double', Number(entry.value));
            break;
        case DBUS_KIND.EMPTY_ARRAY: {
            const signaturePointer = allocCString(String(entry.value));
            strings.push(signaturePointer);
            koffi.encode(pointer, offset + UNION_OFFSET, 'void *', signaturePointer);
            break;
        }
        case DBUS_KIND.INT32_ARRAY: {
            const values = entry.value;
            const valuesPointer = koffi.alloc('int32', Math.max(1, values.length));
            strings.push(valuesPointer);
            values.forEach((value, index) => koffi.encode(valuesPointer, index * 4, 'int32', value));
            const arrayPointer = koffi.alloc(DBusInt32Array, 1);
            strings.push(arrayPointer);
            koffi.encode(arrayPointer, koffi.offsetof(DBusInt32Array, 'values'), 'void *', valuesPointer);
            koffi.encode(arrayPointer, koffi.offsetof(DBusInt32Array, 'count'), 'int32', values.length);
            koffi.encode(pointer, offset + UNION_OFFSET, 'void *', arrayPointer);
            break;
        }
        case DBUS_KIND.STRING_ARRAY:
        case DBUS_KIND.OBJECT_PATH_ARRAY: {
            const values = entry.value;
            const valuesPointer = koffi.alloc('void *', Math.max(1, values.length));
            strings.push(valuesPointer);
            values.forEach((value, index) => {
                const valuePointer = allocCString(String(value));
                strings.push(valuePointer);
                koffi.encode(valuesPointer, index * 8, 'void *', valuePointer);
            });
            const arrayPointer = koffi.alloc(DBusStringArray, 1);
            strings.push(arrayPointer);
            koffi.encode(arrayPointer, koffi.offsetof(DBusStringArray, 'values'), 'void *', valuesPointer);
            koffi.encode(arrayPointer, koffi.offsetof(DBusStringArray, 'count'), 'int32', values.length);
            koffi.encode(pointer, offset + UNION_OFFSET, 'void *', arrayPointer);
            break;
        }
        case DBUS_KIND.BYTE_ARRAY: {
            const values = entry.value;
            const dataPointer = koffi.alloc('uint8', Math.max(1, values.byteLength));
            strings.push(dataPointer);
            if (values.byteLength > 0) {
                koffi.encode(dataPointer, 'uint8', Array.from(values), values.byteLength);
            }
            const arrayPointer = koffi.alloc(DBusByteArray, 1);
            strings.push(arrayPointer);
            koffi.encode(arrayPointer, koffi.offsetof(DBusByteArray, 'data'), 'void *', dataPointer);
            koffi.encode(arrayPointer, koffi.offsetof(DBusByteArray, 'count'), 'int32', values.byteLength);
            koffi.encode(pointer, offset + UNION_OFFSET, 'void *', arrayPointer);
            break;
        }
        case DBUS_KIND.STRING_DICT: {
            const values = entry.value;
            const pairs = Object.entries(values);
            const entriesPointer = koffi.alloc(DBusStringPair, Math.max(1, pairs.length));
            strings.push(entriesPointer);
            pairs.forEach(([key, value], index) => {
                const keyPointer = allocCString(String(key));
                const valuePointer = allocCString(String(value));
                strings.push(keyPointer, valuePointer);
                koffi.encode(entriesPointer, index * koffi.sizeof(DBusStringPair), 'void *', keyPointer);
                koffi.encode(entriesPointer, index * koffi.sizeof(DBusStringPair) + koffi.offsetof(DBusStringPair, 'value'), 'void *', valuePointer);
            });
            const dictionaryPointer = koffi.alloc(DBusStringDictionary, 1);
            strings.push(dictionaryPointer);
            koffi.encode(dictionaryPointer, koffi.offsetof(DBusStringDictionary, 'entries'), 'void *', entriesPointer);
            koffi.encode(dictionaryPointer, koffi.offsetof(DBusStringDictionary, 'count'), 'int32', pairs.length);
            koffi.encode(pointer, offset + UNION_OFFSET, 'void *', dictionaryPointer);
            break;
        }
        case DBUS_KIND.DICT: {
            const values = entry.value;
            const pairs = Object.entries(values);
            const entriesPointer = koffi.alloc(DBusProperty, Math.max(1, pairs.length));
            strings.push(entriesPointer);
            pairs.forEach(([key, value], index) => {
                const keyPointer = allocCString(key);
                strings.push(keyPointer);
                koffi.encode(entriesPointer, index * PROPERTY_SIZE, 'void *', keyPointer);
                encodeEntry(entriesPointer, index * PROPERTY_SIZE + PROPERTY_VALUE_OFFSET, classify(value), strings);
            });
            const dictionaryPointer = koffi.alloc(DBusDictionary, 1);
            strings.push(dictionaryPointer);
            koffi.encode(dictionaryPointer, koffi.offsetof(DBusDictionary, 'entries'), 'void *', entriesPointer);
            koffi.encode(dictionaryPointer, koffi.offsetof(DBusDictionary, 'count'), 'int32', pairs.length);
            koffi.encode(pointer, offset + UNION_OFFSET, 'void *', dictionaryPointer);
            break;
        }
        default:
            throw new Error(`[GeaFFI:DBus] Unsupported argument kind ${entry.kind}.`);
    }
}
export class NativeDBus {
    library;
    connections = new Map();
    constructor(library) {
        this.library = library;
    }
    get available() {
        return true;
    }
    connection(busType) {
        const existing = this.connections.get(busType);
        if (existing !== undefined)
            return existing;
        const out = koffi.alloc('void *', 1);
        try {
            const status = this.library.connect(busType, out);
            if (status !== 0) {
                throw new Error(`[GeaFFI:DBus] Could not connect to the ${busType === 1 ? 'system' : 'session'} bus: ${this.library.lastError()}`);
            }
            const handle = koffi.decode(out, 'void *');
            if (handle === null || handle === undefined || BigInt(handle) === 0n) {
                throw new Error('[GeaFFI:DBus] The bus returned a null connection.');
            }
            const connection = BigInt(handle);
            this.connections.set(busType, connection);
            return connection;
        }
        finally {
            koffi.free(out);
        }
    }
    uniqueName(busType) {
        return this.library.uniqueName(this.connection(busType));
    }
    call(busType, service, objectPath, interfaceName, method, args) {
        const connection = this.connection(busType);
        const prepared = args.map(classify);
        const stringPointers = [];
        const argsPointer = prepared.length > 0 ? koffi.alloc(DBusValue, prepared.length) : null;
        const resultsPointer = koffi.alloc(DBusValue, RESULT_CAPACITY);
        const countPointer = koffi.alloc('int32', 1);
        try {
            koffi.encode(countPointer, 'int32', 0);
            prepared.forEach((entry, index) => {
                encodeEntry(argsPointer, index * VALUE_SIZE, entry, stringPointers);
            });
            const status = this.library.call(connection, service, objectPath, interfaceName, method, argsPointer, prepared.length, resultsPointer, RESULT_CAPACITY, countPointer);
            if (status !== 0) {
                throw new Error(`[GeaFFI:DBus] ${interfaceName}.${method} failed: ${this.library.lastError()}`);
            }
            const count = Number(koffi.decode(countPointer, 'int32'));
            const values = [];
            for (let i = 0; i < count; i++) {
                values.push(decodeValue(resultsPointer, i, this.library));
            }
            return values;
        }
        finally {
            for (const pointer of stringPointers)
                koffi.free(pointer);
            if (argsPointer !== null)
                koffi.free(argsPointer);
            koffi.free(resultsPointer);
            koffi.free(countPointer);
        }
    }
    callStringPropertiesUint(busType, service, objectPath, interfaceName, method, firstArgument, properties) {
        const connection = this.connection(busType);
        const entries = Object.entries(properties).map(([key, value]) => ({
            key,
            entry: classify(value),
        }));
        const propertiesPointer = entries.length > 0 ? koffi.alloc(DBusProperty, entries.length) : null;
        const strings = [];
        const resultPointer = koffi.alloc('uint32', 1);
        try {
            entries.forEach((item, index) => {
                const keyPointer = allocCString(item.key);
                strings.push(keyPointer);
                koffi.encode(propertiesPointer, index * PROPERTY_SIZE, 'void *', keyPointer);
                encodeEntry(propertiesPointer, index * PROPERTY_SIZE + PROPERTY_VALUE_OFFSET, item.entry, strings);
            });
            const status = this.library.callStringPropertiesUint(connection, service, objectPath, interfaceName, method, firstArgument, propertiesPointer, entries.length, resultPointer);
            if (status !== 0) {
                throw new Error(`[GeaFFI:DBus] ${interfaceName}.${method} failed: ${this.library.lastError()}`);
            }
            return Number(koffi.decode(resultPointer, 'uint32'));
        }
        finally {
            for (const pointer of strings)
                koffi.free(pointer);
            if (propertiesPointer !== null)
                koffi.free(propertiesPointer);
            koffi.free(resultPointer);
        }
    }
    setProperty(busType, service, objectPath, interfaceName, propertyName, value) {
        const connection = this.connection(busType);
        const entry = classify(value);
        const pointer = koffi.alloc(DBusValue, 1);
        const strings = [];
        try {
            encodeEntry(pointer, 0, entry, strings);
            const status = this.library.setProperty(connection, service, objectPath, interfaceName, propertyName, pointer);
            if (status !== 0) {
                throw new Error(`[GeaFFI:DBus] Setting ${interfaceName}.${propertyName} failed: ${this.library.lastError()}`);
            }
        }
        finally {
            for (const stringPointer of strings)
                koffi.free(stringPointer);
            koffi.free(pointer);
        }
    }
    addMatch(busType, rule) {
        const connection = this.connection(busType);
        if (this.library.addMatch(connection, rule) !== 0) {
            throw new Error(`[GeaFFI:DBus] AddMatch failed: ${this.library.lastError()}`);
        }
    }
    removeMatch(busType, rule) {
        const connection = this.connection(busType);
        if (this.library.removeMatch(connection, rule) !== 0) {
            throw new Error(`[GeaFFI:DBus] RemoveMatch failed: ${this.library.lastError()}`);
        }
    }
    nextSignal(busType, timeoutMs) {
        const connection = this.connection(busType);
        const capacity = 256;
        const interfaceBuffer = koffi.alloc('char', capacity);
        const memberBuffer = koffi.alloc('char', capacity);
        const pathBuffer = koffi.alloc('char', capacity);
        const values = koffi.alloc(DBusValue, RESULT_CAPACITY);
        const countPointer = koffi.alloc('int32', 1);
        try {
            koffi.encode(countPointer, 'int32', 0);
            const status = this.library.nextSignal(connection, Math.max(0, Math.trunc(timeoutMs)), interfaceBuffer, capacity, memberBuffer, capacity, pathBuffer, capacity, values, RESULT_CAPACITY, countPointer);
            if (status === 0)
                return null;
            if (status < 0) {
                throw new Error(`[GeaFFI:DBus] Waiting for a signal failed: ${this.library.lastError()}`);
            }
            const count = Number(koffi.decode(countPointer, 'int32'));
            const args = [];
            for (let i = 0; i < count; i++) {
                args.push(decodeValue(values, i, this.library));
            }
            return {
                interfaceName: String(koffi.decode(interfaceBuffer, 'char', -1)),
                member: String(koffi.decode(memberBuffer, 'char', -1)),
                path: String(koffi.decode(pathBuffer, 'char', -1)),
                args,
            };
        }
        finally {
            koffi.free(interfaceBuffer);
            koffi.free(memberBuffer);
            koffi.free(pathBuffer);
            koffi.free(values);
            koffi.free(countPointer);
        }
    }
    disconnect(busType) {
        const connection = this.connections.get(busType);
        if (connection === undefined)
            return;
        this.library.disconnect(connection);
        this.connections.delete(busType);
    }
    disconnectAll() {
        for (const busType of [...this.connections.keys()]) {
            this.disconnect(busType);
        }
    }
}
function createBackend() {
    if (typeof process === 'undefined' || (process.platform !== 'linux' && process.platform !== 'darwin')) {
        return null;
    }
    const library = loadLibrary();
    return library ? new NativeDBus(library) : null;
}
export const nativeDBus = createBackend();
//# sourceMappingURL=dbus-native.js.map