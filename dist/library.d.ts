/**
 * @geastack/ffi - Dynamic Library Loader
 * Resolves shared libraries and binds C functions into typed TypeScript invocations.
 */
import { FunctionDescriptor, FFITypeToTypeScript, TargetPlatform } from './types.js';
import { Pointer } from './memory.js';
export type LibraryFunctions = Record<string, FunctionDescriptor<any, any>>;
export type BoundFunctions<T extends LibraryFunctions> = {
    [K in keyof T]: (...args: any[]) => T[K]['async'] extends true ? Promise<FFITypeToTypeScript<T[K]['returns']>> : FFITypeToTypeScript<T[K]['returns']>;
};
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
export declare class DynamicLibrary<T extends LibraryFunctions> {
    readonly path: string;
    readonly symbols: BoundFunctions<T>;
    private handle;
    private isClosed;
    constructor(path: string, functions: T, handle?: Pointer);
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
 * const libm = Library.open('libm', {
 *   cos: { args: ['double'], returns: 'double' },
 *   sin: { args: ['double'], returns: 'double' },
 * });
 *
 * const res = libm.symbols.cos(0.0);
 * ```
 */
export declare class Library {
    /**
     * Load a dynamic library and bind its exported symbols.
     *
     * @param path File path or system name of the shared library.
     * @param functions Dictionary of function descriptors.
     */
    static open<T extends LibraryFunctions>(path: string, functions: T): DynamicLibrary<T>;
    /**
     * Resolve a cross-platform library name into the platform-specific filename.
     */
    static resolveName(nameOrPath: string, platform?: TargetPlatform): string;
}
//# sourceMappingURL=library.d.ts.map