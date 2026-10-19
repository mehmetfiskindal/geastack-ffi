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
}
//# sourceMappingURL=library.d.ts.map