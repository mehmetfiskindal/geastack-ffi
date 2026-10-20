/**
 * @geastack/ffi - Dynamic Library Loader
 * Resolves shared libraries and binds C functions into typed TypeScript invocations.
 */
import { FunctionDescriptor, TargetPlatform } from './types.js';
import { Pointer } from './memory.js';
import { NativeCallBinding } from './host-backend.js';
export type LibraryFunctions = Record<string, FunctionDescriptor>;
export type BoundFunction = (...args: any[]) => any;
export type BoundFunctions = Record<string, BoundFunction>;
/**
 * Returns the default shared library extension for the current or target platform.
 */
export declare function getPlatformLibraryExtension(platform?: TargetPlatform): string;
/**
 * Resolves a logical library name (e.g. 'sqlite3', 'user32', 'libm') into the
 * canonical shared library filename for the target platform:
 * - Windows: 'sqlite3.dll', 'user32.dll'
 * - Linux / Android: 'libsqlite3.so', 'libm.so'
 * - macOS / iOS: 'libsqlite3.dylib', 'libm.dylib'
 * If a path separator or explicit extension (.dll, .so, .dylib) is already present, returns as-is.
 */
export declare function resolvePlatformLibraryName(nameOrPath: string, platform?: TargetPlatform): string;
export declare function detectHostPlatform(): TargetPlatform;
export declare function registerMockFunction(libPath: string, symbolName: string, impl: (...args: any[]) => any): void;
/**
 * Represents an opened Dynamic Library.
 */
export interface LibraryOpenOptions {
    /**
     * `auto` uses the mock backend when any mock has been registered for the library name.
     * Otherwise it loads a shared library.
     * `mock` never loads a shared library and returns placeholder results when no mock is registered.
     * `native` loads a shared library and rejects missing libraries and missing symbols.
     */
    readonly backend?: 'auto' | 'mock' | 'native';
}
export declare class DynamicLibrary {
    readonly path: string;
    readonly symbols: BoundFunctions;
    private handle;
    private isClosed;
    private readonly native?;
    constructor(path: string, functions: LibraryFunctions, handle?: Pointer, native?: NativeCallBinding);
    /**
     * Get pointer to a raw symbol in the library.
     */
    getSymbolAddress(symbolName: string): Pointer;
    /**
     * Unload the library from process memory (dlclose / FreeLibrary).
     */
    close(): void;
    private createFunctionBinding;
}
/**
 * Declarative library loader.
 *
 * @example
 * ```ts
 * const kernel32 = Library.open('kernel32.dll', {
 *   GetCurrentProcessId: { args: [], returns: 'uint32' },
 * });
 *
 * const pid = kernel32.symbols.GetCurrentProcessId();
 * kernel32.close();
 * ```
 */
export declare class Library {
    /**
     * Load a dynamic library and bind its exported symbols.
     * Unmocked calls load the shared library. They throw if the library or a symbol is missing.
     *
     * @param path File path or system name of the shared library.
     * @param functions Dictionary of function descriptors.
     * @param options Select the mock backend or the host native loader.
     */
    static open(path: string, functions: LibraryFunctions, options?: LibraryOpenOptions): DynamicLibrary;
    /**
     * Resolve a cross-platform library name into the platform-specific filename.
     */
    static resolveName(nameOrPath: string, platform?: TargetPlatform): string;
}
//# sourceMappingURL=library.d.ts.map