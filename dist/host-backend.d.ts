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
/**
 * Read a native 32-bit integer through a pointer returned by a native call.
 * Used for helpers such as `__errno_location` that return an int pointer.
 */
export declare function readNativeInt32(pointer: Pointer): number;
export declare function openNativeLibrary(libraryPath: string, functions: LibraryFunctions): NativeCallBinding;
//# sourceMappingURL=host-backend.d.ts.map