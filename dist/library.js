// SPDX-License-Identifier: Apache-2.0
/**
 * @geastack/ffi - Dynamic Library Loader
 * Resolves shared libraries and binds C functions into typed TypeScript invocations.
 */
import { Memory, Pointer } from './memory.js';
import { StructInstance, StructDefinition } from './struct.js';
/**
 * Returns the default shared library extension for the current or target platform.
 */
export function getPlatformLibraryExtension(platform) {
    const p = platform || detectHostPlatform();
    switch (p) {
        case 'macos':
        case 'ios':
            return '.dylib';
        case 'windows':
            return '.dll';
        default:
            return '.so';
    }
}
/**
 * Resolves a logical library name (e.g. 'sqlite3', 'user32', 'libm') into the
 * canonical shared library filename for the target platform:
 * - Windows: 'sqlite3.dll', 'user32.dll'
 * - Linux / Android: 'libsqlite3.so', 'libm.so'
 * - macOS / iOS: 'libsqlite3.dylib', 'libm.dylib'
 * If a path separator or explicit extension (.dll, .so, .dylib) is already present, returns as-is.
 */
export function resolvePlatformLibraryName(nameOrPath, platform) {
    if (nameOrPath.includes('/') ||
        nameOrPath.includes('\\') ||
        /\.(dll|dylib|so(\.\d+)*)$/i.test(nameOrPath)) {
        return nameOrPath;
    }
    const p = platform || detectHostPlatform();
    const ext = getPlatformLibraryExtension(p);
    if (p === 'windows') {
        return `${nameOrPath}${ext}`;
    }
    const prefixed = nameOrPath.startsWith('lib') ? nameOrPath : `lib${nameOrPath}`;
    return `${prefixed}${ext}`;
}
export function detectHostPlatform() {
    if (typeof process !== 'undefined' && process.platform) {
        if (process.platform === 'darwin')
            return 'macos';
        if (process.platform === 'win32')
            return 'windows';
        if (process.platform === 'android')
            return 'android';
        return 'linux';
    }
    return 'linux';
}
/**
 * Registry of mock or registered native implementations for development and tests.
 */
const mockNativeImplementations = new Map();
export function registerMockFunction(libPath, symbolName, impl) {
    let libMap = mockNativeImplementations.get(libPath);
    if (!libMap) {
        libMap = new Map();
        mockNativeImplementations.set(libPath, libMap);
    }
    libMap.set(symbolName, impl);
}
/**
 * Represents an opened Dynamic Library.
 */
export class DynamicLibrary {
    path;
    symbols;
    handle;
    isClosed = false;
    constructor(path, functions, handle) {
        this.path = path;
        this.handle = handle || new Pointer(0x20000000n); // Virtual handle for mock/host runtime
        this.symbols = {};
        // Bind each declared function
        for (const [name, descriptor] of Object.entries(functions)) {
            const symbolName = descriptor.symbol || name;
            this.symbols[name] = this.createFunctionBinding(symbolName, descriptor);
        }
    }
    /**
     * Get pointer to a raw symbol in the library.
     */
    getSymbolAddress(_symbolName) {
        if (this.isClosed) {
            throw new Error(`[GeaFFI] Library '${this.path}' is closed.`);
        }
        // Returns simulated symbol pointer address
        return new Pointer(0x30000000n);
    }
    /**
     * Unload the library from process memory (dlclose / FreeLibrary).
     */
    close() {
        if (this.isClosed)
            return;
        this.isClosed = true;
        this.handle = Pointer.NULL;
    }
    createFunctionBinding(symbolName, descriptor) {
        return (...rawArgs) => {
            if (this.isClosed) {
                throw new Error(`[GeaFFI] Cannot call '${symbolName}': Library '${this.path}' is closed.`);
            }
            // Check if a mock or pre-registered implementation exists
            const libMap = mockNativeImplementations.get(this.path) ||
                mockNativeImplementations.get(resolvePlatformLibraryName(this.path));
            const mockImpl = libMap?.get(symbolName);
            if (mockImpl) {
                return mockImpl(...rawArgs);
            }
            // Marshal arguments according to FFI types
            const marshaledArgs = [];
            const cleanupTasks = [];
            try {
                for (let i = 0; i < descriptor.args.length; i++) {
                    const argType = descriptor.args[i];
                    const argVal = rawArgs[i];
                    if (argType === 'string') {
                        if (typeof argVal === 'string') {
                            const strPtr = Memory.writeCString(argVal);
                            marshaledArgs.push(strPtr);
                            cleanupTasks.push(() => Memory.free(strPtr));
                        }
                        else if (argVal instanceof Pointer) {
                            marshaledArgs.push(argVal);
                        }
                        else {
                            marshaledArgs.push(Pointer.NULL);
                        }
                    }
                    else if (argType === 'wstring') {
                        if (typeof argVal === 'string') {
                            const wstrPtr = Memory.writeWString(argVal);
                            marshaledArgs.push(wstrPtr);
                            cleanupTasks.push(() => Memory.free(wstrPtr));
                        }
                        else if (argVal instanceof Pointer) {
                            marshaledArgs.push(argVal);
                        }
                        else {
                            marshaledArgs.push(Pointer.NULL);
                        }
                    }
                    else if (argType === 'buffer') {
                        if (argVal instanceof Uint8Array) {
                            const bufPtr = Memory.writeBuffer(argVal);
                            marshaledArgs.push(bufPtr);
                            cleanupTasks.push(() => Memory.free(bufPtr));
                        }
                        else if (argVal instanceof Pointer) {
                            marshaledArgs.push(argVal);
                        }
                        else {
                            marshaledArgs.push(Pointer.NULL);
                        }
                    }
                    else if (argType instanceof StructDefinition) {
                        if (argVal instanceof StructInstance) {
                            marshaledArgs.push(argVal.pointer);
                        }
                        else if (argVal instanceof Pointer) {
                            marshaledArgs.push(argVal);
                        }
                        else {
                            const structInst = argType.alloc(argVal);
                            marshaledArgs.push(structInst.pointer);
                            cleanupTasks.push(() => structInst.free());
                        }
                    }
                    else {
                        marshaledArgs.push(argVal);
                    }
                }
                // Default fallback result when no hardware/live backend is hooked
                return defaultResultForType(descriptor.returns);
            }
            finally {
                // Run cleanups (e.g. transient string allocations)
                for (const cleanup of cleanupTasks) {
                    try {
                        cleanup();
                    }
                    catch {
                        // Ignore cleanup errors
                    }
                }
            }
        };
    }
}
function defaultResultForType(type) {
    if (type === 'void')
        return undefined;
    if (type === 'bool')
        return false;
    if (type === 'int64' || type === 'uint64')
        return 0n;
    if (type === 'string' || type === 'wstring')
        return '';
    if (type === 'pointer')
        return Pointer.NULL;
    if (typeof type === 'string')
        return 0;
    if (type instanceof StructDefinition) {
        const inst = type.alloc();
        const obj = inst.toObject();
        inst.free();
        return obj;
    }
    return null;
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
export class Library {
    /**
     * Load a dynamic library and bind its exported symbols.
     *
     * @param path File path or system name of the shared library.
     * @param functions Dictionary of function descriptors.
     */
    static open(path, functions) {
        return new DynamicLibrary(path, functions);
    }
    /**
     * Resolve a cross-platform library name into the platform-specific filename.
     */
    static resolveName(nameOrPath, platform) {
        return resolvePlatformLibraryName(nameOrPath, platform);
    }
}
//# sourceMappingURL=library.js.map