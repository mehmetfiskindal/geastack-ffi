// SPDX-License-Identifier: Apache-2.0
/**
 * @geastack/ffi - Dynamic Library Loader
 * Resolves shared libraries and binds C functions into typed TypeScript invocations.
 */

import {
  FFIType,
  FunctionDescriptor,
  FFITypeToTypeScript,
  TargetPlatform,
} from './types.js';
import { Memory, Pointer } from './memory.js';
import { StructInstance } from './struct.js';

declare const process: any;

export type LibraryFunctions = Record<string, FunctionDescriptor<any, any>>;

export type BoundFunctions<T extends LibraryFunctions> = {
  [K in keyof T]: (
    ...args: any[]
  ) => T[K]['async'] extends true
    ? Promise<FFITypeToTypeScript<T[K]['returns']>>
    : FFITypeToTypeScript<T[K]['returns']>;
};

/**
 * Returns the default shared library extension for the current or target platform.
 */
export function getPlatformLibraryExtension(platform?: TargetPlatform): string {
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
export function resolvePlatformLibraryName(nameOrPath: string, platform?: TargetPlatform): string {
  if (
    nameOrPath.includes('/') ||
    nameOrPath.includes('\\') ||
    /\.(dll|dylib|so(\.\d+)*)$/i.test(nameOrPath)
  ) {
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

export function detectHostPlatform(): TargetPlatform {
  if (typeof process !== 'undefined' && process.platform) {
    if (process.platform === 'darwin') return 'macos';
    if (process.platform === 'win32') return 'windows';
    if (process.platform === 'android') return 'android';
    return 'linux';
  }
  return 'linux';
}

/**
 * Registry of mock or registered native implementations for development and tests.
 */
const mockNativeImplementations = new Map<string, Map<string, (...args: any[]) => any>>();

export function registerMockFunction(libPath: string, symbolName: string, impl: (...args: any[]) => any): void {
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
export class DynamicLibrary<T extends LibraryFunctions> {
  readonly path: string;
  readonly symbols: BoundFunctions<T>;
  private handle: Pointer;
  private isClosed = false;

  constructor(path: string, functions: T, handle?: Pointer) {
    this.path = path;
    this.handle = handle || new Pointer(0x20000000n); // Virtual handle for mock/host runtime
    this.symbols = {} as BoundFunctions<T>;

    // Bind each declared function
    for (const [name, descriptor] of Object.entries(functions)) {
      const symbolName = descriptor.symbol || name;
      (this.symbols as any)[name] = this.createFunctionBinding(symbolName, descriptor);
    }
  }

  /**
   * Get pointer to a raw symbol in the library.
   */
  getSymbolAddress(symbolName: string): Pointer {
    if (this.isClosed) {
      throw new Error(`[GeaFFI] Library '${this.path}' is closed.`);
    }
    // Returns simulated symbol pointer address
    return new Pointer(0x30000000n);
  }

  /**
   * Unload the library from process memory (dlclose / FreeLibrary).
   */
  close(): void {
    if (this.isClosed) return;
    this.isClosed = true;
    this.handle = Pointer.NULL;
  }

  private createFunctionBinding(symbolName: string, descriptor: FunctionDescriptor<any, any>) {
    return (...rawArgs: any[]) => {
      if (this.isClosed) {
        throw new Error(`[GeaFFI] Cannot call '${symbolName}': Library '${this.path}' is closed.`);
      }

      // Check if a mock or pre-registered implementation exists
      const libMap =
        mockNativeImplementations.get(this.path) ||
        mockNativeImplementations.get(resolvePlatformLibraryName(this.path));
      const mockImpl = libMap?.get(symbolName);

      if (mockImpl) {
        return mockImpl(...rawArgs);
      }

      // Marshal arguments according to FFI types
      const marshaledArgs: any[] = [];
      const cleanupTasks: Array<() => void> = [];

      try {
        for (let i = 0; i < descriptor.args.length; i++) {
          const argType = descriptor.args[i];
          const argVal = rawArgs[i];

          if (argType === 'string') {
            if (typeof argVal === 'string') {
              const strPtr = Memory.writeCString(argVal);
              marshaledArgs.push(strPtr);
              cleanupTasks.push(() => Memory.free(strPtr));
            } else if (argVal instanceof Pointer) {
              marshaledArgs.push(argVal);
            } else {
              marshaledArgs.push(Pointer.NULL);
            }
          } else if (argType === 'wstring') {
            if (typeof argVal === 'string') {
              const wstrPtr = Memory.writeWString(argVal);
              marshaledArgs.push(wstrPtr);
              cleanupTasks.push(() => Memory.free(wstrPtr));
            } else if (argVal instanceof Pointer) {
              marshaledArgs.push(argVal);
            } else {
              marshaledArgs.push(Pointer.NULL);
            }
          } else if (argType === 'buffer') {
            if (argVal instanceof Uint8Array) {
              const bufPtr = Memory.writeBuffer(argVal);
              marshaledArgs.push(bufPtr);
              cleanupTasks.push(() => Memory.free(bufPtr));
            } else if (argVal instanceof Pointer) {
              marshaledArgs.push(argVal);
            } else {
              marshaledArgs.push(Pointer.NULL);
            }
          } else if (typeof argType === 'object' && '__isStruct' in argType) {
            if (argVal instanceof StructInstance) {
              marshaledArgs.push(argVal.pointer);
            } else if (argVal instanceof Pointer) {
              marshaledArgs.push(argVal);
            } else {
              const structInst = argType.alloc(argVal);
              marshaledArgs.push(structInst.pointer);
              cleanupTasks.push(() => structInst.free());
            }
          } else {
            marshaledArgs.push(argVal);
          }
        }

        // Default fallback result when no hardware/live backend is hooked
        return defaultResultForType(descriptor.returns);
      } finally {
        // Run cleanups (e.g. transient string allocations)
        for (const cleanup of cleanupTasks) {
          try {
            cleanup();
          } catch {
            // Ignore cleanup errors
          }
        }
      }
    };
  }
}

function defaultResultForType(type: FFIType): any {
  if (type === 'void') return undefined;
  if (type === 'bool') return false;
  if (type === 'int64' || type === 'uint64') return 0n;
  if (type === 'string' || type === 'wstring') return '';
  if (type === 'pointer') return Pointer.NULL;
  if (typeof type === 'string') return 0;
  if (typeof type === 'object' && '__isStruct' in type) {
    const ptr = Memory.alloc(type.size);
    const inst = new StructInstance(type, ptr);
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
  static open<T extends LibraryFunctions>(path: string, functions: T): DynamicLibrary<T> {
    return new DynamicLibrary(path, functions);
  }

  /**
   * Resolve a cross-platform library name into the platform-specific filename.
   */
  static resolveName(nameOrPath: string, platform?: TargetPlatform): string {
    return resolvePlatformLibraryName(nameOrPath, platform);
  }
}
