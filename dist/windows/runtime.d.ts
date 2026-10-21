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
import { Pointer } from '../memory.js';
export declare function listNativeRegistryValues(root: number, subKey: string): {
    name: string;
    type: number;
}[] | null;
export declare function readNativeRegistryString(root: number, subKey: string, valueName: string): string | null;
export declare function readNativeRegistryDword(root: number, subKey: string, valueName: string): number | null;
export declare function writeNativeRegistryString(root: number, subKey: string, valueName: string, value: string): boolean;
export declare function writeNativeRegistryDword(root: number, subKey: string, valueName: string, value: number): boolean;
/** Real GetLastError on Windows, or null on other hosts. */
export declare function getNativeLastError(): number | null;
/** Real SetLastError on Windows. Returns false when no native API is available. */
export declare function setNativeLastError(code: number): boolean;
export declare function deleteNativeRegistryKey(root: number, subKey: string): boolean;
export declare function nativeCoInitialize(apartment: 'STA' | 'MTA'): number | null;
export declare function nativeCoUninitialize(): boolean;
export declare function nativeCoCreateGuid(): string | null;
export declare function nativeCoCreateInstance(clsid: string, iid: string): bigint | null;
export type ComReturnKind = 'hresult' | 'int' | 'uint' | 'pointer' | 'void';
export type ComArgKind = 'pointer' | 'int' | 'uint' | 'string' | 'wstring';
/**
 * Call a COM vtable entry. Index 0/1/2 are QueryInterface/AddRef/Release;
 * interface methods follow in declaration order.
 */
export declare function callNativeComMethod(object: Pointer, methodIndex: number, returnKind: ComReturnKind, argKinds: readonly ComArgKind[], values: readonly unknown[]): unknown;
/** QueryInterface on a native COM object, returning a new interface pointer. */
export declare function queryNativeComInterface(object: Pointer, iid: string): bigint;
/** Allocate a zeroed UTF-16 buffer for COM/Win32 out-parameters. */
export declare function allocNativeWideBuffer(charCount: number): bigint;
/** Read a NUL-terminated UTF-16 buffer. */
export declare function readNativeWideBuffer(pointer: bigint): string;
export declare function freeNativeBuffer(pointer: bigint): void;
//# sourceMappingURL=runtime.d.ts.map