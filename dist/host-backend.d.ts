/**
 * Host shared-library backend.
 * Loads a real dynamic library and calls exported C functions.
 */
import { Pointer } from './memory.js';
import { CallbackDefinition, FunctionDescriptor } from './types.js';
export type LibraryFunctions = Record<string, FunctionDescriptor>;
export interface NativeCallBinding {
    invoke(symbolName: string, descriptor: FunctionDescriptor, args: readonly unknown[]): unknown;
    symbolAddress(symbolName: string): Pointer;
    close(): void;
    moduleAddress: Pointer;
}
/** A registered persistent callback; call release() when the native side is done. */
export declare class CallbackHandle {
    readonly definition: CallbackDefinition;
    readonly handle: bigint;
    private released;
    constructor(definition: CallbackDefinition, handle: bigint);
    release(): void;
}
export declare function createCallback(definition: CallbackDefinition, callback: (...args: unknown[]) => unknown): CallbackHandle;
/**
 * Read a native 32-bit integer through a pointer returned by a native call.
 * Used for helpers such as `__errno_location` that return an int pointer.
 */
export declare function readNativeInt32(pointer: Pointer): number;
export declare function openNativeLibrary(libraryPath: string, functions: LibraryFunctions): NativeCallBinding;
//# sourceMappingURL=host-backend.d.ts.map