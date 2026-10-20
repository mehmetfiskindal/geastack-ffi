// SPDX-License-Identifier: Apache-2.0
/**
 * @geastack/ffi - Dynamic Library Loader
 * Resolves shared libraries and binds C functions into typed TypeScript invocations.
 */

import {
  FFIType,
  FunctionDescriptor,
  TargetPlatform,
} from './types.js';
import { Memory, Pointer } from './memory.js';
import { StructInstance, StructDefinition } from './struct.js';
import { openNativeLibrary, NativeCallBinding } from './host-backend.js';

declare const process: any;

export type LibraryFunctions = Record<string, FunctionDescriptor>;
export type BoundFunction = (...args: any[]) => any;
export type BoundFunctions = Record<string, BoundFunction>;

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
export interface LibraryOpenOptions {
  /**
   * `auto` uses the mock backend when any mock has been registered for the library name.
   * Otherwise it loads a shared library.
   * `mock` never loads a shared library and returns placeholder results when no mock is registered.
   * `native` loads a shared library and rejects missing libraries and missing symbols.
   */
  readonly backend?: 'auto' | 'mock' | 'native';
}

function mockImplementationsFor(path: string): Map<string, (...args: any[]) => any> | undefined {
  return (
    mockNativeImplementations.get(path) ||
    mockNativeImplementations.get(resolvePlatformLibraryName(path))
  );
}

function hasRegisteredMocks(path: string): boolean {
  const mocks = mockImplementationsFor(path);
  return mocks !== undefined && mocks.size > 0;
}

export class DynamicLibrary {
  readonly path: string;
  readonly symbols: BoundFunctions;
  private handle: Pointer;
  private isClosed = false;
  private readonly native?: NativeCallBinding;

  constructor(path: string, functions: LibraryFunctions, handle?: Pointer, native?: NativeCallBinding) {
    this.path = path;
    this.native = native;
    this.handle = handle || native?.moduleAddress || new Pointer(0x20000000n);
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
  getSymbolAddress(symbolName: string): Pointer {
    if (this.isClosed) {
      throw new Error(`[GeaFFI] Library '${this.path}' is closed.`);
    }
    if (this.native) {
      return this.native.symbolAddress(symbolName);
    }
    return new Pointer(0x30000000n);
  }

  /**
   * Unload the library from process memory (dlclose / FreeLibrary).
   */
  close(): void {
    if (this.isClosed) return;
    this.isClosed = true;
    this.native?.close();
    this.handle = Pointer.NULL;
  }

  private createFunctionBinding(symbolName: string, descriptor: FunctionDescriptor): BoundFunction {
    return (...rawArgs: any[]) => {
      if (this.isClosed) {
        throw new Error(`[GeaFFI] Cannot call '${symbolName}': Library '${this.path}' is closed.`);
      }

      const mockImpl = this.native ? undefined : mockImplementationsFor(this.path)?.get(symbolName);

      if (mockImpl) {
        return mockImpl(...rawArgs);
      }

      if (this.native) {
        return this.native.invoke(symbolName, descriptor, rawArgs);
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
          } else if (argType instanceof StructDefinition) {
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

        // Placeholder result for the mock backend when no mock function is registered.
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
 * const kernel32 = Library.open('kernel32.dll', {
 *   GetCurrentProcessId: { args: [], returns: 'uint32' },
 * });
 *
 * const pid = kernel32.symbols.GetCurrentProcessId();
 * kernel32.close();
 * ```
 */
export class Library {
  /**
   * Load a dynamic library and bind its exported symbols.
   * Unmocked calls load the shared library. They throw if the library or a symbol is missing.
   *
   * @param path File path or system name of the shared library.
   * @param functions Dictionary of function descriptors.
   * @param options Select the mock backend or the host native loader.
   */
  static open(path: string, functions: LibraryFunctions, options?: LibraryOpenOptions): DynamicLibrary {
    const backend = options?.backend ?? 'auto';
    if (backend === 'mock' || (backend === 'auto' && hasRegisteredMocks(path))) {
      return new DynamicLibrary(path, functions);
    }

    const resolved = resolvePlatformLibraryName(path);
    const native = openNativeLibrary(resolved, functions);
    return new DynamicLibrary(path, functions, native.moduleAddress, native);
  }

  /**
   * Resolve a cross-platform library name into the platform-specific filename.
   */
  static resolveName(nameOrPath: string, platform?: TargetPlatform): string {
    return resolvePlatformLibraryName(nameOrPath, platform);
  }
}
