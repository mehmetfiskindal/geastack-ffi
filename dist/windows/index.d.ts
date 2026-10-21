/**
 * @geastack/ffi - Windows (Win32, Registry & COM / WinRT) Bridge
 * High-performance interop with Win32 DLLs, UTF-16 wide strings (LPCWSTR),
 * Windows Registry, HRESULT error codes, and Component Object Model (COM).
 */
import { Pointer } from '../memory.js';
import { DynamicLibrary, LibraryFunctions } from '../library.js';
import { type ComArgKind, type ComReturnKind } from './runtime.js';
/**
 * Common Win32 / COM HRESULT Constants.
 */
export declare const HRESULT: {
    readonly S_OK: 0;
    readonly S_FALSE: 1;
    readonly E_NOTIMPL: -2147467263;
    readonly E_NOINTERFACE: -2147467262;
    readonly E_POINTER: -2147467261;
    readonly E_ABORT: -2147467260;
    readonly E_FAIL: -2147467259;
    readonly E_ACCESSDENIED: -2147024891;
    readonly E_INVALIDARG: -2147024809;
    readonly E_OUTOFMEMORY: -2147024882;
};
/**
 * Standard Windows Registry Root Keys (HKEY).
 */
export declare const HKEY: {
    readonly HKEY_CLASSES_ROOT: 2147483648;
    readonly HKEY_CURRENT_USER: 2147483649;
    readonly HKEY_LOCAL_MACHINE: 2147483650;
    readonly HKEY_USERS: 2147483651;
    readonly HKEY_CURRENT_CONFIG: 2147483653;
};
export type HKeyRoot = (typeof HKEY)[keyof typeof HKEY] | keyof typeof HKEY;
/**
 * Core Win32 API Helpers (UTF-16 LPCWSTR, HRESULT, GetLastError, System DLL loader).
 */
export declare class Win32 {
    /**
     * Allocate a null-terminated UTF-16LE wide string (LPCWSTR / wchar_t*) in native memory.
     */
    static toWideString(str: string): Pointer;
    /**
     * Read a null-terminated UTF-16LE wide string (LPCWSTR / LPWSTR) from native memory.
     */
    static fromWideString(ptr: Pointer): string;
    /** Allocate a zeroed UTF-16 buffer for Win32/COM out-parameters. */
    static allocNativeWideBuffer(charCount: number): Pointer;
    /** Read a NUL-terminated UTF-16 buffer allocated by allocNativeWideBuffer. */
    static readNativeWideString(pointer: Pointer): string;
    /** Release memory allocated by allocNativeWideBuffer. */
    static freeNative(pointer: Pointer): void;
    /**
     * Returns true if the given HRESULT value indicates success (hr >= 0).
     */
    static SUCCEEDED(hr: number): boolean;
    /**
     * Returns true if the given HRESULT value indicates failure (hr < 0).
     */
    static FAILED(hr: number): boolean;
    /**
     * Throws a descriptive Error if the HRESULT indicates failure.
     */
    static checkHResult(hr: number, operation?: string): void;
    /**
     * Retrieve the thread's last Win32 error code (GetLastError).
     */
    static getLastError(): number;
    /**
     * Set the thread's last Win32 error code (SetLastError).
     */
    static setLastError(code: number): void;
    /**
     * Open a Windows DLL (e.g. 'user32', 'kernel32', 'advapi32', 'powrprof') with automatic '.dll' resolution.
     */
    static openSystemLibrary(dllName: string, functions: LibraryFunctions): DynamicLibrary;
}
export interface WinRegistryOptions {
    /**
     * `auto` (reads) prefers a stored/mock value and falls back to advapi32 on
     * Windows. `store` keeps the in-process simulation. `native` always calls
     * advapi32 and never consults the store. Writes default to `store`.
     */
    readonly backend?: 'auto' | 'store' | 'native';
}
/**
 * Windows Registry Interop Helper (Advapi32 RegGetValueW / RegSetValueExW bridge).
 *
 * `auto` reads use the in-process store first, then the real registry on
 * Windows. Pass `{ backend: 'native' }` to bypass the store.
 */
export declare class WinRegistry {
    /**
     * Read a REG_SZ string value from the Windows Registry.
     */
    static readString(rootKey: HKeyRoot, subKey: string, valueName: string, options?: WinRegistryOptions): string | null;
    /**
     * Read a REG_DWORD 32-bit integer value from the Windows Registry.
     */
    static readDword(rootKey: HKeyRoot, subKey: string, valueName: string, options?: WinRegistryOptions): number | null;
    /**
     * Write a REG_SZ string value to the Windows Registry.
     */
    static writeString(rootKey: HKeyRoot, subKey: string, valueName: string, value: string, options?: WinRegistryOptions): boolean;
    /**
     * Write a REG_DWORD 32-bit integer value to the Windows Registry.
     */
    static writeDword(rootKey: HKeyRoot, subKey: string, valueName: string, value: number, options?: WinRegistryOptions): boolean;
    /**
     * Delete a key tree. Native mode calls advapi32 RegDeleteTreeW; store mode
     * removes matching simulated entries.
     */
    static deleteKey(rootKey: HKeyRoot, subKey: string, options?: WinRegistryOptions): boolean;
}
/**
 * Parsed 128-bit Windows GUID / UUID structure.
 */
export interface GUID {
    readonly data1: number;
    readonly data2: number;
    readonly data3: number;
    readonly data4: Uint8Array;
    readonly canonical: string;
}
/**
 * A named method on a COM interface. `index` is the zero-based vtable slot
 * (0/1/2 are QueryInterface/AddRef/Release).
 */
export interface COMMethodDescriptor {
    readonly index: number;
    readonly returns: ComReturnKind;
    readonly args: readonly ComArgKind[];
}
/**
 * Represents a Windows COM interface instance (IUnknown / IInspectable).
 */
export declare class COMObject {
    readonly pointer: Pointer;
    readonly clsid: string;
    readonly iid: string;
    private refCount;
    constructor(pointer: Pointer, clsid: string, iid?: string);
    /** True when this pointer came from a real ole32 CoCreateInstance. */
    private get isNativeObject();
    /**
     * Call a raw vtable slot on a native COM object.
     * Index 0/1/2 are QueryInterface/AddRef/Release; interface methods follow.
     */
    callVTable(methodIndex: number, returnKind: ComReturnKind, argKinds: readonly ComArgKind[], ...args: unknown[]): unknown;
    /**
     * Invoke a virtual method on this COM interface instance.
     */
    call(methodName: string, ...args: any[]): any;
    /**
     * Query for another COM interface (IUnknown::QueryInterface).
     */
    queryInterface(targetIid: string): COMObject;
    /**
     * Increment reference count (IUnknown::AddRef).
     */
    addRef(): number;
    /**
     * Decrement reference count (IUnknown::Release).
     */
    release(): number;
}
export interface COMBackendOptions {
    /** `auto` uses ole32 when available; `simulate` never touches the OS. */
    readonly backend?: 'auto' | 'native' | 'simulate';
}
/**
 * Windows Component Object Model (COM / WinRT) Bridge.
 */
export declare class COM {
    /**
     * Initialize the COM library on the current thread (CoInitializeEx).
     */
    static initialize(apartment?: 'STA' | 'MTA', options?: COMBackendOptions): number;
    /**
     * Close the COM library on the current thread (CoUninitialize).
     */
    static uninitialize(): void;
    /**
     * Returns true if COM is currently initialized.
     */
    static isInitialized(): boolean;
    /**
     * Create a new GUID with CoCreateGuid on Windows.
     */
    static createGuid(options?: COMBackendOptions): string;
    /**
     * Parse and validate a canonical GUID string (with or without braces).
     */
    static parseGuid(guidString: string): GUID;
    /**
     * Instantiate a COM object by CLSID and IID (CoCreateInstance).
     */
    static createInstance(clsid: string, iid?: string, options?: COMBackendOptions): COMObject;
    /**
     * Describe a COM interface so `object.call('Method', ...)` can use its vtable.
     * Out-parameters, arrays, and structs are not supported by this helper; use
     * callVTable() for those.
     */
    static defineInterface(iid: string, methods: Record<string, COMMethodDescriptor>): void;
    /**
     * Register a custom handler for a COM method (for dev/test simulation or custom vtable routing).
     */
    static registerHandler(methodOrClsidMethod: string, handler: (target: COMObject, ...args: any[]) => any): void;
    /**
     * Internal dispatch for COM method invocations.
     */
    static invokeMethod(target: COMObject, methodName: string, ...args: any[]): any;
}
//# sourceMappingURL=index.d.ts.map