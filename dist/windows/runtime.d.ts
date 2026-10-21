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
export declare function listNativeRegistrySubKeys(root: number, subKey: string): string[] | null;
export declare function deleteNativeRegistryValue(root: number, subKey: string, valueName: string): boolean;
export declare function listNativeRegistryValues(root: number, subKey: string): {
    name: string;
    type: number;
}[] | null;
export declare function readNativeRegistryString(root: number, subKey: string, valueName: string): string | null;
export declare function readNativeRegistryDword(root: number, subKey: string, valueName: string): number | null;
export declare function readNativeRegistryMultiString(root: number, subKey: string, valueName: string): string[] | null;
export declare function readNativeRegistryExpandString(root: number, subKey: string, valueName: string): string | null;
export declare function readNativeRegistryQword(root: number, subKey: string, valueName: string): bigint | null;
export declare function readNativeRegistryBinary(root: number, subKey: string, valueName: string): Uint8Array | null;
export declare function writeNativeRegistryString(root: number, subKey: string, valueName: string, value: string): boolean;
export declare function writeNativeRegistryDword(root: number, subKey: string, valueName: string, value: number): boolean;
export declare function writeNativeRegistryMultiString(root: number, subKey: string, valueName: string, values: readonly string[]): boolean;
export declare function writeNativeRegistryExpandString(root: number, subKey: string, valueName: string, value: string): boolean;
export declare function writeNativeRegistryQword(root: number, subKey: string, valueName: string, value: bigint): boolean;
export declare function writeNativeRegistryBinary(root: number, subKey: string, valueName: string, value: Uint8Array): boolean;
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
export type ComArgKind = 'pointer' | 'int' | 'uint' | 'int64' | 'string' | 'wstring';
/**
 * Call a COM vtable entry. Index 0/1/2 are QueryInterface/AddRef/Release;
 * interface methods follow in declaration order.
 */
export declare function callNativeComMethod(object: Pointer, methodIndex: number, returnKind: ComReturnKind, argKinds: readonly ComArgKind[], values: readonly unknown[]): unknown;
/** QueryInterface on a native COM object, returning a new interface pointer. */
export declare function queryNativeComInterface(object: Pointer, iid: string): bigint;
/** Allocate a zeroed UTF-16 buffer for COM/Win32 out-parameters. */
export declare function allocNativeWideBuffer(charCount: number): bigint;
/** Allocate a zeroed native byte buffer. */
export declare function allocNativeBuffer(byteLength: number): bigint;
/** Copy bytes into a native buffer. */
export declare function writeNativeBuffer(pointer: bigint, data: Uint8Array): void;
/** Read a native pointer from a buffer. */
export declare function readNativePointer(pointer: bigint): bigint;
/** Read bytes from a native buffer. */
export declare function readNativeBuffer(pointer: bigint, byteLength: number): Uint8Array;
/** Read a NUL-terminated UTF-16 buffer. */
export declare function readNativeWideBuffer(pointer: bigint): string;
export declare function freeNativeBuffer(pointer: bigint): void;
//# sourceMappingURL=runtime.d.ts.map