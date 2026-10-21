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
export declare function readNativeRegistryString(root: number, subKey: string, valueName: string): string | null;
export declare function readNativeRegistryDword(root: number, subKey: string, valueName: string): number | null;
export declare function writeNativeRegistryString(root: number, subKey: string, valueName: string, value: string): boolean;
export declare function writeNativeRegistryDword(root: number, subKey: string, valueName: string, value: number): boolean;
/** Real GetLastError on Windows, or null on other hosts. */
export declare function getNativeLastError(): number | null;
/** Real SetLastError on Windows. Returns false when no native API is available. */
export declare function setNativeLastError(code: number): boolean;
export declare function deleteNativeRegistryKey(root: number, subKey: string): boolean;
//# sourceMappingURL=runtime.d.ts.map