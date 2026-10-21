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
import { adoptNativePointer } from '../native-pointers.js';
import { Library } from '../library.js';
const RRF_RT_REG_SZ = 0x00000002;
const RRF_RT_REG_DWORD = 0x00000010;
const KEY_SET_VALUE = 0x0002;
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
    const [data1, data2, data3, data4] = clean.split('-');
    const bytes = data4.match(/.{2}/g) || [];
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
//# sourceMappingURL=runtime.js.map