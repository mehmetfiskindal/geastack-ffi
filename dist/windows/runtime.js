// SPDX-License-Identifier: Apache-2.0
/**
 * Real Windows registry access for the Node host.
 *
 * The TypeScript `WinRegistry` helpers are deterministic simulations used by
 * cross-platform tests. On Windows, `{ backend: 'native' }` routes the same
 * calls to `advapi32.dll`:
 *
 *   RegGetValueW     read REG_SZ / REG_DWORD
 *   RegCreateKeyExW  create or open a key for writing
 *   RegSetValueExW   write a value
 *   RegCloseKey      release the key handle
 *
 * Koffi owns the temporary native buffers (size, key handle, data).
 */
import koffi from 'koffi';
import { adoptNativePointer, requireNativeAddress } from '../native-pointers.js';
import { Pointer } from '../memory.js';
import { Library } from '../library.js';
const RRF_RT_REG_SZ = 0x00000002;
const RRF_RT_REG_DWORD = 0x00000010;
const KEY_SET_VALUE = 0x0002;
const KEY_READ = 0x20019;
const ERROR_MORE_DATA = 234;
const ERROR_NO_MORE_ITEMS = 259;
const REG_SZ = 1;
const REG_DWORD = 4;
let registryApi;
function hkeyHandle(root) {
    // Predefined HKEY values are sign-extended LONG handles on 64-bit Windows.
    return BigInt.asUintN(64, BigInt(root | 0));
}
function loadRegistryApi() {
    if (registryApi !== undefined)
        return registryApi;
    if (typeof process === 'undefined' || process.platform !== 'win32') {
        registryApi = null;
        return null;
    }
    try {
        const library = Library.open('advapi32.dll', {
            RegGetValueW: {
                args: ['pointer', 'wstring', 'wstring', 'uint32', 'pointer', 'buffer', 'pointer'],
                returns: 'int32',
            },
            RegCreateKeyExW: {
                args: ['pointer', 'wstring', 'uint32', 'pointer', 'uint32', 'uint32', 'pointer', 'pointer', 'pointer'],
                returns: 'int32',
            },
            RegSetValueExW: {
                args: ['pointer', 'wstring', 'uint32', 'uint32', 'buffer', 'uint32'],
                returns: 'int32',
            },
            RegCloseKey: {
                args: ['pointer'],
                returns: 'int32',
            },
            RegDeleteTreeW: {
                args: ['pointer', 'wstring'],
                returns: 'int32',
            },
            RegOpenKeyExW: {
                args: ['pointer', 'wstring', 'uint32', 'uint32', 'pointer'],
                returns: 'int32',
            },
            RegEnumValueW: {
                args: ['pointer', 'uint32', 'buffer', 'pointer', 'pointer', 'pointer', 'buffer', 'pointer'],
                returns: 'int32',
            },
            RegEnumKeyExW: {
                args: ['pointer', 'uint32', 'buffer', 'pointer', 'pointer', 'pointer', 'pointer', 'pointer'],
                returns: 'int32',
            },
            RegDeleteValueW: {
                args: ['pointer', 'wstring'],
                returns: 'int32',
            },
        }, { backend: 'native' });
        const symbols = library.symbols;
        registryApi = {
            library,
            readStringValue: (root, subKey, valueName, flags, data, sizePointer) => Number(symbols.RegGetValueW(adoptNativePointer(hkeyHandle(root)), subKey, valueName, flags, null, data, adoptNativePointer(sizePointer))),
            readDwordValue: (root, subKey, valueName, flags, data, sizePointer) => Number(symbols.RegGetValueW(adoptNativePointer(hkeyHandle(root)), subKey, valueName, flags, null, data, adoptNativePointer(sizePointer))),
            createKey: (root, subKey, keyOut) => Number(symbols.RegCreateKeyExW(adoptNativePointer(hkeyHandle(root)), subKey, 0, null, 0, KEY_SET_VALUE, null, adoptNativePointer(keyOut), null)),
            setValue: (key, valueName, type, data) => Number(symbols.RegSetValueExW(adoptNativePointer(key), valueName, 0, type, data, data.byteLength)),
            closeKey: (key) => Number(symbols.RegCloseKey(adoptNativePointer(key))),
            deleteTree: (root, subKey) => Number(symbols.RegDeleteTreeW(adoptNativePointer(hkeyHandle(root)), subKey)),
            openKey: (root, subKey, keyOut, access = KEY_READ) => Number(symbols.RegOpenKeyExW(adoptNativePointer(hkeyHandle(root)), subKey, 0, access, adoptNativePointer(keyOut))),
            enumValue: (key, index, name, nameLength, type, data, dataLength) => Number(symbols.RegEnumValueW(adoptNativePointer(key), index, name, adoptNativePointer(nameLength), null, adoptNativePointer(type), data, adoptNativePointer(dataLength))),
            enumKey: (key, index, name, nameLength) => Number(symbols.RegEnumKeyExW(adoptNativePointer(key), index, name, adoptNativePointer(nameLength), null, null, null, null)),
            deleteValue: (key, valueName) => Number(symbols.RegDeleteValueW(adoptNativePointer(key), valueName)),
        };
        return registryApi;
    }
    catch {
        registryApi = null;
        return null;
    }
}
function decodeUtf16(data, byteLength) {
    const length = Math.min(byteLength, data.byteLength) & ~1;
    const text = new TextDecoder('utf-16le').decode(data.subarray(0, length));
    const nul = text.indexOf('\0');
    return nul >= 0 ? text.slice(0, nul) : text;
}
function encodeUtf16(value) {
    const data = new Uint8Array((value.length + 1) * 2);
    const view = new DataView(data.buffer);
    for (let i = 0; i < value.length; i++) {
        view.setUint16(i * 2, value.charCodeAt(i), true);
    }
    view.setUint16(value.length * 2, 0, true);
    return data;
}
export function listNativeRegistrySubKeys(root, subKey) {
    const api = loadRegistryApi();
    if (!api)
        return null;
    const keyPointer = koffi.alloc('void *', 1);
    let key = null;
    try {
        if (api.openKey(root, subKey, keyPointer) !== 0)
            return null;
        const decoded = koffi.decode(keyPointer, 'void *');
        key = decoded === null || decoded === undefined ? null : BigInt(decoded);
        if (key === null)
            return null;
        const names = [];
        const nameBuffer = new Uint8Array(32768);
        const nameLength = koffi.alloc('uint32', 1);
        try {
            for (let index = 0;; index++) {
                koffi.encode(nameLength, 'uint32', nameBuffer.byteLength / 2);
                const status = api.enumKey(key, index, nameBuffer, nameLength);
                if (status === ERROR_NO_MORE_ITEMS)
                    break;
                if (status !== 0)
                    return null;
                const chars = Number(koffi.decode(nameLength, 'uint32'));
                names.push(decodeUtf16(nameBuffer, chars * 2));
            }
        }
        finally {
            koffi.free(nameLength);
        }
        return names;
    }
    finally {
        if (key !== null)
            api.closeKey(key);
        koffi.free(keyPointer);
    }
}
export function deleteNativeRegistryValue(root, subKey, valueName) {
    const api = loadRegistryApi();
    if (!api)
        return false;
    const keyPointer = koffi.alloc('void *', 1);
    let key = null;
    try {
        if (api.openKey(root, subKey, keyPointer, KEY_SET_VALUE) !== 0)
            return false;
        const decoded = koffi.decode(keyPointer, 'void *');
        key = decoded === null || decoded === undefined ? null : BigInt(decoded);
        if (key === null)
            return false;
        return api.deleteValue(key, valueName) === 0;
    }
    finally {
        if (key !== null)
            api.closeKey(key);
        koffi.free(keyPointer);
    }
}
export function listNativeRegistryValues(root, subKey) {
    const api = loadRegistryApi();
    if (!api)
        return null;
    const keyPointer = koffi.alloc('void *', 1);
    let key = null;
    try {
        if (api.openKey(root, subKey, keyPointer) !== 0)
            return null;
        const decoded = koffi.decode(keyPointer, 'void *');
        key = decoded === null || decoded === undefined ? null : BigInt(decoded);
        if (key === null)
            return null;
        const values = [];
        const nameBuffer = new Uint8Array(32768);
        const dataBuffer = new Uint8Array(65536);
        const nameLength = koffi.alloc('uint32', 1);
        const typePointer = koffi.alloc('uint32', 1);
        const dataLength = koffi.alloc('uint32', 1);
        try {
            for (let index = 0;; index++) {
                koffi.encode(nameLength, 'uint32', nameBuffer.byteLength / 2);
                koffi.encode(typePointer, 'uint32', 0);
                koffi.encode(dataLength, 'uint32', dataBuffer.byteLength);
                const status = api.enumValue(key, index, nameBuffer, nameLength, typePointer, dataBuffer, dataLength);
                if (status === ERROR_NO_MORE_ITEMS)
                    break;
                if (status !== 0 && status !== ERROR_MORE_DATA)
                    return null;
                const chars = Number(koffi.decode(nameLength, 'uint32'));
                const name = decodeUtf16(nameBuffer, chars * 2);
                const type = Number(koffi.decode(typePointer, 'uint32'));
                values.push({ name, type });
            }
        }
        finally {
            koffi.free(nameLength);
            koffi.free(typePointer);
            koffi.free(dataLength);
        }
        return values;
    }
    finally {
        if (key !== null)
            api.closeKey(key);
        koffi.free(keyPointer);
    }
}
export function readNativeRegistryString(root, subKey, valueName) {
    const api = loadRegistryApi();
    if (!api)
        return null;
    const data = new Uint8Array(65536);
    const sizePointer = koffi.alloc('uint32', 1);
    try {
        koffi.encode(sizePointer, 'uint32', data.byteLength);
        const status = api.readStringValue(root, subKey, valueName, RRF_RT_REG_SZ, data, sizePointer);
        if (status !== 0)
            return null;
        const size = Number(koffi.decode(sizePointer, 'uint32'));
        return decodeUtf16(data, size);
    }
    finally {
        koffi.free(sizePointer);
    }
}
export function readNativeRegistryDword(root, subKey, valueName) {
    const api = loadRegistryApi();
    if (!api)
        return null;
    const data = new Uint8Array(4);
    const sizePointer = koffi.alloc('uint32', 1);
    try {
        koffi.encode(sizePointer, 'uint32', data.byteLength);
        const status = api.readDwordValue(root, subKey, valueName, RRF_RT_REG_DWORD, data, sizePointer);
        if (status !== 0)
            return null;
        const size = Number(koffi.decode(sizePointer, 'uint32'));
        if (size < 4)
            return null;
        return new DataView(data.buffer, data.byteOffset, 4).getUint32(0, true);
    }
    finally {
        koffi.free(sizePointer);
    }
}
function createKey(api, root, subKey) {
    const keyPointer = koffi.alloc('void *', 1);
    try {
        const status = api.createKey(root, subKey, keyPointer);
        if (status !== 0)
            return null;
        const handle = koffi.decode(keyPointer, 'void *');
        return handle === null || handle === undefined ? null : BigInt(handle);
    }
    finally {
        koffi.free(keyPointer);
    }
}
export function writeNativeRegistryString(root, subKey, valueName, value) {
    const api = loadRegistryApi();
    if (!api)
        return false;
    const handle = createKey(api, root, subKey);
    if (handle === null)
        return false;
    try {
        return api.setValue(handle, valueName, REG_SZ, encodeUtf16(value)) === 0;
    }
    finally {
        api.closeKey(handle);
    }
}
export function writeNativeRegistryDword(root, subKey, valueName, value) {
    const api = loadRegistryApi();
    if (!api)
        return false;
    const handle = createKey(api, root, subKey);
    if (handle === null)
        return false;
    try {
        const data = new Uint8Array(4);
        new DataView(data.buffer).setUint32(0, value >>> 0, true);
        return api.setValue(handle, valueName, REG_DWORD, data) === 0;
    }
    finally {
        api.closeKey(handle);
    }
}
let kernelApi;
function loadKernelApi() {
    if (kernelApi !== undefined)
        return kernelApi;
    if (typeof process === 'undefined' || process.platform !== 'win32') {
        kernelApi = null;
        return null;
    }
    try {
        const library = Library.open('kernel32.dll', {
            GetLastError: { args: [], returns: 'uint32' },
            SetLastError: { args: ['uint32'], returns: 'void' },
        }, { backend: 'native' });
        const symbols = library.symbols;
        kernelApi = {
            getLastError: () => Number(symbols.GetLastError()),
            setLastError: (code) => {
                symbols.SetLastError(code >>> 0);
            },
        };
        return kernelApi;
    }
    catch {
        kernelApi = null;
        return null;
    }
}
/** Real GetLastError on Windows, or null on other hosts. */
export function getNativeLastError() {
    const api = loadKernelApi();
    return api ? api.getLastError() : null;
}
/** Real SetLastError on Windows. Returns false when no native API is available. */
export function setNativeLastError(code) {
    const api = loadKernelApi();
    if (!api)
        return false;
    api.setLastError(code);
    return true;
}
export function deleteNativeRegistryKey(root, subKey) {
    const api = loadRegistryApi();
    if (!api)
        return false;
    return api.deleteTree(root, subKey) === 0;
}
const OleGuid = koffi.struct('GeaOleGuid', {
    Data1: 'uint32',
    Data2: 'uint16',
    Data3: 'uint16',
    Data4_0: 'uint8',
    Data4_1: 'uint8',
    Data4_2: 'uint8',
    Data4_3: 'uint8',
    Data4_4: 'uint8',
    Data4_5: 'uint8',
    Data4_6: 'uint8',
    Data4_7: 'uint8',
});
let oleApi;
function loadOleApi() {
    if (oleApi !== undefined)
        return oleApi;
    if (typeof process === 'undefined' || process.platform !== 'win32') {
        oleApi = null;
        return null;
    }
    try {
        const library = Library.open('ole32.dll', {
            CoInitializeEx: { args: ['pointer', 'uint32'], returns: 'int32' },
            CoUninitialize: { args: [], returns: 'void' },
            CoCreateGuid: { args: ['pointer'], returns: 'int32' },
            CoCreateInstance: {
                args: ['pointer', 'pointer', 'uint32', 'pointer', 'pointer'],
                returns: 'int32',
            },
        }, { backend: 'native' });
        const symbols = library.symbols;
        oleApi = {
            initialize: (reserved, coinit) => Number(symbols.CoInitializeEx(reserved, coinit)),
            uninitialize: () => {
                symbols.CoUninitialize();
            },
            createGuid: (guid) => Number(symbols.CoCreateGuid(adoptNativePointer(guid))),
            createInstance: (clsid, outer, clsctx, iid, out) => Number(symbols.CoCreateInstance(adoptNativePointer(clsid), outer, clsctx, adoptNativePointer(iid), adoptNativePointer(out))),
        };
        return oleApi;
    }
    catch {
        oleApi = null;
        return null;
    }
}
export function nativeCoInitialize(apartment) {
    const api = loadOleApi();
    if (!api)
        return null;
    return api.initialize(null, apartment === 'STA' ? 2 : 0);
}
export function nativeCoUninitialize() {
    const api = loadOleApi();
    if (!api)
        return false;
    api.uninitialize();
    return true;
}
function formatGuid(value) {
    const part = (number, width) => number.toString(16).toUpperCase().padStart(width, '0');
    const tail = [
        value.Data4_0, value.Data4_1, value.Data4_2, value.Data4_3,
        value.Data4_4, value.Data4_5, value.Data4_6, value.Data4_7,
    ].map((byte) => part(byte, 2)).join('');
    return `${part(value.Data1, 8)}-${part(value.Data2, 4)}-${part(value.Data3, 4)}-${tail.slice(0, 4)}-${tail.slice(4)}`;
}
export function nativeCoCreateGuid() {
    const api = loadOleApi();
    if (!api)
        return null;
    const pointer = koffi.alloc(OleGuid, 1);
    try {
        if (api.createGuid(pointer) !== 0)
            return null;
        return formatGuid(koffi.decode(pointer, OleGuid));
    }
    finally {
        koffi.free(pointer);
    }
}
function encodeGuid(pointer, canonical) {
    const clean = canonical.replace(/[{}]/g, '');
    const [data1, data2, data3, data4a, data4b] = clean.split('-');
    // GUID's Data4 is 8 bytes: the 4th group (2 bytes) plus the 5th group (6 bytes).
    const bytes = `${data4a}${data4b}`.match(/.{2}/g) || [];
    koffi.encode(pointer, 0, OleGuid, {
        Data1: parseInt(data1, 16) >>> 0,
        Data2: parseInt(data2, 16) & 0xffff,
        Data3: parseInt(data3, 16) & 0xffff,
        Data4_0: parseInt(bytes[0] || '00', 16),
        Data4_1: parseInt(bytes[1] || '00', 16),
        Data4_2: parseInt(bytes[2] || '00', 16),
        Data4_3: parseInt(bytes[3] || '00', 16),
        Data4_4: parseInt(bytes[4] || '00', 16),
        Data4_5: parseInt(bytes[5] || '00', 16),
        Data4_6: parseInt(bytes[6] || '00', 16),
        Data4_7: parseInt(bytes[7] || '00', 16),
    });
}
export function nativeCoCreateInstance(clsid, iid) {
    const api = loadOleApi();
    if (!api)
        return null;
    const clsidPointer = koffi.alloc(OleGuid, 1);
    const iidPointer = koffi.alloc(OleGuid, 1);
    const outPointer = koffi.alloc('void *', 1);
    try {
        encodeGuid(clsidPointer, clsid);
        encodeGuid(iidPointer, iid);
        // CLSCTX_INPROC_SERVER
        if (api.createInstance(clsidPointer, null, 1, iidPointer, outPointer) !== 0)
            return null;
        const value = koffi.decode(outPointer, 'void *');
        if (value === null || value === undefined)
            return null;
        const handle = BigInt(value);
        return handle === 0n ? null : handle;
    }
    finally {
        koffi.free(clsidPointer);
        koffi.free(iidPointer);
        koffi.free(outPointer);
    }
}
const pointerSize = koffi.sizeof('void *');
const protoCache = new Map();
function comType(kind) {
    switch (kind) {
        case 'pointer': return 'void *';
        case 'uint': return 'uint32';
        case 'int':
        case 'hresult': return 'int32';
    }
}
function comArgumentType(kind) {
    switch (kind) {
        case 'pointer': return 'void *';
        case 'uint': return 'uint32';
        case 'int': return 'int32';
        case 'string': return 'const char *';
        case 'wstring': return 'str16';
    }
}
function marshalComArgument(kind, value) {
    if (kind === 'pointer') {
        if (value === null || value === undefined)
            return null;
        if (value instanceof Pointer)
            return requireNativeAddress(value, 'COM argument');
        if (typeof value === 'bigint')
            return value;
        throw new Error('[GeaFFI:COM] Pointer arguments must be Pointer or bigint values.');
    }
    if (kind === 'string' || kind === 'wstring') {
        if (typeof value !== 'string')
            throw new Error('[GeaFFI:COM] Expected a string argument.');
        return value;
    }
    if (typeof value !== 'number')
        throw new Error(`[GeaFFI:COM] Expected a numeric ${kind} argument.`);
    return value;
}
/**
 * Call a COM vtable entry. Index 0/1/2 are QueryInterface/AddRef/Release;
 * interface methods follow in declaration order.
 */
export function callNativeComMethod(object, methodIndex, returnKind, argKinds, values) {
    if (typeof process === 'undefined' || process.platform !== 'win32') {
        throw new Error('[GeaFFI:COM] Native COM calls are only available on Windows.');
    }
    if (pointerSize !== 8) {
        throw new Error('[GeaFFI:COM] The vtable dispatcher currently supports 64-bit Windows only.');
    }
    const address = requireNativeAddress(object, 'COM object');
    if (address === null)
        throw new Error('[GeaFFI:COM] Cannot call through a NULL COM pointer.');
    const vtable = koffi.decode(address, 'void *');
    if (vtable === null || vtable === undefined) {
        throw new Error('[GeaFFI:COM] The COM object has no vtable.');
    }
    const method = koffi.decode(BigInt(vtable), methodIndex * pointerSize, 'void *');
    if (method === null || method === undefined) {
        throw new Error(`[GeaFFI:COM] Vtable entry ${methodIndex} is null.`);
    }
    const resultType = returnKind === 'void' ? 'void' : comType(returnKind);
    const argumentTypes = ['void *', ...argKinds.map(comArgumentType)];
    const key = `${resultType}|${argumentTypes.join(',')}`;
    let proto = protoCache.get(key);
    if (!proto) {
        proto = koffi.proto(resultType, argumentTypes);
        protoCache.set(key, proto);
    }
    const callArguments = [
        BigInt(method),
        proto,
        BigInt(address),
        ...values.map((value, index) => marshalComArgument(argKinds[index], value)),
    ];
    const result = koffi.call(...callArguments);
    if (returnKind === 'void')
        return undefined;
    if (returnKind === 'pointer') {
        if (result === null || result === undefined)
            return Pointer.NULL;
        return adoptNativePointer(BigInt(result));
    }
    return Number(result);
}
/** QueryInterface on a native COM object, returning a new interface pointer. */
export function queryNativeComInterface(object, iid) {
    const iidPointer = koffi.alloc(OleGuid, 1);
    const outPointer = koffi.alloc('void *', 1);
    try {
        encodeGuid(iidPointer, iid);
        const hr = Number(callNativeComMethod(object, 0, 'hresult', ['pointer', 'pointer'], [iidPointer, outPointer]));
        if (hr < 0) {
            throw new Error(`[GeaFFI:COM] QueryInterface(${iid}) failed with HRESULT 0x${(hr >>> 0).toString(16)}.`);
        }
        const value = koffi.decode(outPointer, 'void *');
        if (value === null || value === undefined) {
            throw new Error(`[GeaFFI:COM] QueryInterface(${iid}) returned a null pointer.`);
        }
        return BigInt(value);
    }
    finally {
        koffi.free(iidPointer);
        koffi.free(outPointer);
    }
}
/** Allocate a zeroed UTF-16 buffer for COM/Win32 out-parameters. */
export function allocNativeWideBuffer(charCount) {
    const count = Math.max(1, Math.trunc(charCount));
    const pointer = koffi.alloc('uint16', count);
    koffi.encode(pointer, 'uint16', Array.from({ length: count }, () => 0), count);
    return BigInt(pointer);
}
/** Read a NUL-terminated UTF-16 buffer. */
export function readNativeWideBuffer(pointer) {
    const value = koffi.decode.string16(pointer);
    return value === null || value === undefined ? '' : String(value);
}
export function freeNativeBuffer(pointer) {
    koffi.free(pointer);
}
//# sourceMappingURL=runtime.js.map