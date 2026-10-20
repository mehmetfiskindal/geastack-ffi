/**
 * Host shared-library backend.
 * Loads a real dynamic library and calls exported C functions.
 */
import { Pointer } from './memory.js';
import { FunctionDescriptor } from './types.js';
export type LibraryFunctions = Record<string, FunctionDescriptor>;
export interface NativeCallBinding {
    invoke(symbolName: string, descriptor: FunctionDescriptor, args: readonly unknown[]): unknown;
    symbolAddress(symbolName: string): Pointer;
    close(): void;
    moduleAddress: Pointer;
}
export declare function openNativeLibrary(libraryPath: string, functions: LibraryFunctions): NativeCallBinding;
//# sourceMappingURL=host-backend.d.ts.map