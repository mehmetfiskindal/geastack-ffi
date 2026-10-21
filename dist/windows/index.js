// SPDX-License-Identifier: Apache-2.0
/**
 * @geastack/ffi - Windows (Win32, Registry & COM / WinRT) Bridge
 * High-performance interop with Win32 DLLs, UTF-16 wide strings (LPCWSTR),
 * Windows Registry, HRESULT error codes, and Component Object Model (COM).
 */
import { Pointer, Memory } from '../memory.js';
import { Library, resolvePlatformLibraryName } from '../library.js';
import { readNativeRegistryString, readNativeRegistryDword, writeNativeRegistryString, writeNativeRegistryDword, getNativeLastError, setNativeLastError, deleteNativeRegistryKey, } from './runtime.js';
/**
 * Common Win32 / COM HRESULT Constants.
 */
export const HRESULT = {
    S_OK: 0x00000000,
    S_FALSE: 0x00000001,
    E_NOTIMPL: -2147467263, // 0x80004001
    E_NOINTERFACE: -2147467262, // 0x80004002
    E_POINTER: -2147467261, // 0x80004003
    E_ABORT: -2147467260, // 0x80004004
    E_FAIL: -2147467259, // 0x80004005
    E_ACCESSDENIED: -2147024891, // 0x80070005
    E_INVALIDARG: -2147024809, // 0x80070057
    E_OUTOFMEMORY: -2147024882, // 0x8007000E
};
/**
 * Standard Windows Registry Root Keys (HKEY).
 */
export const HKEY = {
    HKEY_CLASSES_ROOT: 0x80000000,
    HKEY_CURRENT_USER: 0x80000001,
    HKEY_LOCAL_MACHINE: 0x80000002,
    HKEY_USERS: 0x80000003,
    HKEY_CURRENT_CONFIG: 0x80000005,
};
let lastWin32Error = 0;
/**
 * Core Win32 API Helpers (UTF-16 LPCWSTR, HRESULT, GetLastError, System DLL loader).
 */
export class Win32 {
    /**
     * Allocate a null-terminated UTF-16LE wide string (LPCWSTR / wchar_t*) in native memory.
     */
    static toWideString(str) {
        return Memory.writeWString(str);
    }
    /**
     * Read a null-terminated UTF-16LE wide string (LPCWSTR / LPWSTR) from native memory.
     */
    static fromWideString(ptr) {
        return Memory.readWString(ptr);
    }
    /**
     * Returns true if the given HRESULT value indicates success (hr >= 0).
     */
    static SUCCEEDED(hr) {
        return (hr | 0) >= 0;
    }
    /**
     * Returns true if the given HRESULT value indicates failure (hr < 0).
     */
    static FAILED(hr) {
        return (hr | 0) < 0;
    }
    /**
     * Throws a descriptive Error if the HRESULT indicates failure.
     */
    static checkHResult(hr, operation = 'Win32/COM operation') {
        if (Win32.FAILED(hr)) {
            const unsignedHex = '0x' + ((hr >>> 0).toString(16).toUpperCase().padStart(8, '0'));
            throw new Error(`[GeaFFI:Windows] ${operation} failed with HRESULT ${unsignedHex} (${hr | 0})`);
        }
    }
    /**
     * Retrieve the thread's last Win32 error code (GetLastError).
     */
    static getLastError() {
        return getNativeLastError() ?? lastWin32Error;
    }
    /**
     * Set the thread's last Win32 error code (SetLastError).
     */
    static setLastError(code) {
        lastWin32Error = code >>> 0;
        setNativeLastError(lastWin32Error);
    }
    /**
     * Open a Windows DLL (e.g. 'user32', 'kernel32', 'advapi32', 'powrprof') with automatic '.dll' resolution.
     */
    static openSystemLibrary(dllName, functions) {
        const resolved = resolvePlatformLibraryName(dllName, 'windows');
        return Library.open(resolved, functions);
    }
}
/**
 * In-memory store for simulated/mock Windows Registry entries in cross-platform dev/test environments.
 */
const registryStore = new Map();
function normalizeHKeyName(root) {
    if (typeof root === 'string')
        return root;
    for (const [k, v] of Object.entries(HKEY)) {
        if (v === root)
            return k;
    }
    return `0x${(root >>> 0).toString(16)}`;
}
function makeRegistryKey(root, subKey, valueName) {
    const cleanSubKey = subKey.replace(/\//g, '\\').replace(/^\\+|\\+$/g, '');
    return `${normalizeHKeyName(root)}\\${cleanSubKey}::${valueName}`;
}
function numericHKey(rootKey) {
    if (typeof rootKey === 'number')
        return rootKey;
    const value = HKEY[rootKey];
    if (typeof value !== 'number') {
        throw new Error(`[GeaFFI:Windows] Unknown registry root '${rootKey}'.`);
    }
    return value;
}
/**
 * Windows Registry Interop Helper (Advapi32 RegGetValueW / RegSetValueExW bridge).
 *
 * `auto` reads use the in-process store first, then the real registry on
 * Windows. Pass `{ backend: 'native' }` to bypass the store.
 */
export class WinRegistry {
    /**
     * Read a REG_SZ string value from the Windows Registry.
     */
    static readString(rootKey, subKey, valueName, options) {
        const backend = options?.backend ?? 'auto';
        const key = makeRegistryKey(rootKey, subKey, valueName);
        const val = registryStore.get(key);
        if (backend !== 'native' && typeof val === 'string')
            return val;
        if (backend === 'store')
            return null;
        return readNativeRegistryString(numericHKey(rootKey), subKey, valueName);
    }
    /**
     * Read a REG_DWORD 32-bit integer value from the Windows Registry.
     */
    static readDword(rootKey, subKey, valueName, options) {
        const backend = options?.backend ?? 'auto';
        const key = makeRegistryKey(rootKey, subKey, valueName);
        const val = registryStore.get(key);
        if (backend !== 'native' && typeof val === 'number')
            return val;
        if (backend === 'store')
            return null;
        return readNativeRegistryDword(numericHKey(rootKey), subKey, valueName);
    }
    /**
     * Write a REG_SZ string value to the Windows Registry.
     */
    static writeString(rootKey, subKey, valueName, value, options) {
        if (options?.backend === 'native') {
            return writeNativeRegistryString(numericHKey(rootKey), subKey, valueName, value);
        }
        const key = makeRegistryKey(rootKey, subKey, valueName);
        registryStore.set(key, value);
        return true;
    }
    /**
     * Write a REG_DWORD 32-bit integer value to the Windows Registry.
     */
    static writeDword(rootKey, subKey, valueName, value, options) {
        if (options?.backend === 'native') {
            return writeNativeRegistryDword(numericHKey(rootKey), subKey, valueName, value);
        }
        const key = makeRegistryKey(rootKey, subKey, valueName);
        registryStore.set(key, value >>> 0);
        return true;
    }
    /**
     * Delete a key tree. Native mode calls advapi32 RegDeleteTreeW; store mode
     * removes matching simulated entries.
     */
    static deleteKey(rootKey, subKey, options) {
        if (options?.backend === 'native') {
            return deleteNativeRegistryKey(numericHKey(rootKey), subKey);
        }
        const prefix = `${normalizeHKeyName(rootKey)}\\${subKey.replace(/\//g, '\\').replace(/^\\+|\\+$/g, '')}\\`;
        for (const key of [...registryStore.keys()]) {
            if (key.startsWith(prefix))
                registryStore.delete(key);
        }
        return true;
    }
}
/**
 * Represents a Windows COM interface instance (IUnknown / IInspectable).
 */
export class COMObject {
    pointer;
    clsid;
    iid;
    refCount = 1;
    constructor(pointer, clsid, iid = '00000000-0000-0000-C000-000000000046') {
        this.pointer = pointer;
        this.clsid = clsid;
        this.iid = iid.toUpperCase();
    }
    /**
     * Invoke a virtual method on this COM interface instance.
     */
    call(methodName, ...args) {
        if (this.pointer.isNull() || this.refCount <= 0) {
            throw new Error(`[GeaFFI:COM] Cannot invoke '${methodName}' on released or NULL COM object.`);
        }
        return COM.invokeMethod(this, methodName, ...args);
    }
    /**
     * Query for another COM interface (IUnknown::QueryInterface).
     */
    queryInterface(targetIid) {
        if (this.pointer.isNull() || this.refCount <= 0) {
            throw new Error('[GeaFFI:COM] Cannot call QueryInterface on released or NULL COM object.');
        }
        const cleanIid = COM.parseGuid(targetIid).canonical;
        return new COMObject(this.pointer.offset(0x10), this.clsid, cleanIid);
    }
    /**
     * Increment reference count (IUnknown::AddRef).
     */
    addRef() {
        this.refCount++;
        return this.refCount;
    }
    /**
     * Decrement reference count (IUnknown::Release).
     */
    release() {
        if (this.refCount > 0) {
            this.refCount--;
        }
        return this.refCount;
    }
}
const comMethodHandlers = new Map();
let comInitialized = false;
function hashGuid(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash) + str.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
}
/**
 * Windows Component Object Model (COM / WinRT) Bridge.
 */
export class COM {
    /**
     * Initialize the COM library on the current thread (CoInitializeEx).
     */
    static initialize(_apartment = 'MTA') {
        comInitialized = true;
        return HRESULT.S_OK;
    }
    /**
     * Close the COM library on the current thread (CoUninitialize).
     */
    static uninitialize() {
        comInitialized = false;
    }
    /**
     * Returns true if COM is currently initialized.
     */
    static isInitialized() {
        return comInitialized;
    }
    /**
     * Parse and validate a canonical GUID string (with or without braces).
     */
    static parseGuid(guidString) {
        const trimmed = guidString.trim().replace(/^\{|\}$/g, '');
        const match = /^([0-9a-fA-F]{8})-([0-9a-fA-F]{4})-([0-9a-fA-F]{4})-([0-9a-fA-F]{4})-([0-9a-fA-F]{12})$/.exec(trimmed);
        if (!match) {
            throw new Error(`[GeaFFI:COM] Invalid GUID format: '${guidString}'`);
        }
        const data1 = parseInt(match[1], 16) >>> 0;
        const data2 = parseInt(match[2], 16) & 0xffff;
        const data3 = parseInt(match[3], 16) & 0xffff;
        const hex4 = match[4] + match[5];
        const data4 = new Uint8Array(8);
        for (let i = 0; i < 8; i++) {
            data4[i] = parseInt(hex4.slice(i * 2, i * 2 + 2), 16);
        }
        return {
            data1,
            data2,
            data3,
            data4,
            canonical: trimmed.toUpperCase(),
        };
    }
    /**
     * Instantiate a COM object by CLSID and IID (CoCreateInstance).
     */
    static createInstance(clsid, iid = '00000000-0000-0000-C000-000000000046') {
        if (!comInitialized) {
            COM.initialize('MTA');
        }
        const parsedClsid = COM.parseGuid(clsid);
        const parsedIid = COM.parseGuid(iid);
        const ptr = new Pointer(BigInt(hashGuid(parsedClsid.canonical + parsedIid.canonical) + 0x90000000));
        return new COMObject(ptr, parsedClsid.canonical, parsedIid.canonical);
    }
    /**
     * Register a custom handler for a COM method (for dev/test simulation or custom vtable routing).
     */
    static registerHandler(methodOrClsidMethod, handler) {
        comMethodHandlers.set(methodOrClsidMethod, handler);
    }
    /**
     * Internal dispatch for COM method invocations.
     */
    static invokeMethod(target, methodName, ...args) {
        const specificKey = `${target.clsid}::${methodName}`;
        const iidKey = `${target.iid}::${methodName}`;
        const handler = comMethodHandlers.get(specificKey) ||
            comMethodHandlers.get(iidKey) ||
            comMethodHandlers.get(methodName);
        if (handler) {
            return handler(target, ...args);
        }
        return HRESULT.S_OK;
    }
}
//# sourceMappingURL=index.js.map