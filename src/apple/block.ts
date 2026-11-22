// SPDX-License-Identifier: Apache-2.0
/**
 * Native Objective-C reference-counted malloc blocks backed by a tiny C helper.
 *
 * The helper copies a stack block via _Block_copy() so Foundation and GCD APIs
 * can safely retain/copy it without causing use-after-free when releaseNativeBlock()
 * is called. Koffi trampolines are unregistered only after the block's final
 * dispose helper runs.
 */

import koffi, { type TypeObject } from 'koffi';
import { Pointer } from '../memory.js';
import {
  adoptNativePointer,
  isNativePointer,
  requireNativeAddress,
  revokeNativePointer,
} from '../native-pointers.js';
import { helperLibraryCandidates } from '../host-paths.js';
import type { ObjCValueType } from './runtime.js';

declare const process: {
  platform?: string;
  env: Record<string, string | undefined>;
};

interface BlockHelper {
  readonly create: (invoke: bigint) => bigint;
  readonly free: (block: bigint) => void;
  readonly drainDisposed?: (out: bigint, capacity: number) => number;
}

const handles = new Map<bigint, bigint>();
const pendingDisposeByInvoke = new Map<bigint, bigint>();
const blockProtos = new Map<string, TypeObject>();
const POINTER_SIZE = koffi.sizeof('void *');
let helper: BlockHelper | null | undefined;

function blockArgumentType(type: ObjCValueType): string {
  switch (type) {
    case 'id':
    case 'class':
    case 'sel':
    case 'pointer':
      return 'void *';
    case 'string':
      return 'const char *';
    case 'int':
      return 'int32';
    case 'uint':
      return 'uint32';
    case 'long':
      return 'int64';
    case 'ulong':
      return 'uint64';
    case 'float':
      return 'float';
    case 'double':
      return 'double';
    case 'bool':
      return 'bool';
    case 'void':
      throw new Error('[GeaFFI] void is not a valid block argument type.');
    default:
      throw new Error(`[GeaFFI] Unknown block argument type '${String(type)}'.`);
  }
}

function blockResultType(type: ObjCValueType): string {
  if (type === 'void') return 'void';
  if (type === 'string') return 'const char *';
  switch (type) {
    case 'id':
    case 'class':
    case 'sel':
    case 'pointer':
      return 'void *';
    case 'int':
      return 'int32';
    case 'uint':
      return 'uint32';
    case 'long':
      return 'int64';
    case 'ulong':
      return 'uint64';
    case 'float':
      return 'float';
    case 'double':
      return 'double';
    case 'bool':
      return 'bool';
    default:
      throw new Error(`[GeaFFI] Unknown block result type '${String(type)}'.`);
  }
}

function loadHelper(): BlockHelper | null {
  if (helper !== undefined) return helper;
  helper = null;
  if (process.platform !== 'darwin') return helper;

  const candidates = helperLibraryCandidates(
    'apple-block',
    ['libgea_apple_block.dylib'],
    'GEA_FFI_APPLE_BLOCK_LIBRARY',
    process.env
  );

  for (const candidate of candidates) {
    try {
      const library = koffi.load(candidate);
      let drainDisposed: ((out: bigint, capacity: number) => number) | undefined;
      try {
        drainDisposed = library.func('gea_ffi_block_drain_disposed', 'int32', ['void *', 'int32']);
      } catch {
        // Older helper binary without deferred dispose draining.
      }
      helper = {
        create: library.func('gea_ffi_block_create', 'void *', ['void *']),
        free: library.func('gea_ffi_block_free', 'void', ['void *']),
        drainDisposed,
      };
      return helper;
    } catch {
      // Try the next candidate.
    }
  }
  return helper;
}

function drainDisposedCallbacks(lib: BlockHelper): void {
  if (!lib.drainDisposed || pendingDisposeByInvoke.size === 0) return;
  const capacity = 32;
  const buffer = koffi.alloc('void *', capacity);
  try {
    while (true) {
      const count = lib.drainDisposed(buffer, capacity);
      if (count <= 0) break;
      for (let i = 0; i < count; i++) {
        const invokeAddress = koffi.decode(buffer, i * POINTER_SIZE, 'void *');
        if (invokeAddress === null || invokeAddress === undefined) continue;
        const key = BigInt(invokeAddress);
        const registered = pendingDisposeByInvoke.get(key);
        if (registered !== undefined) {
          pendingDisposeByInvoke.delete(key);
          koffi.unregister(registered);
        }
      }
      if (count < capacity) break;
    }
  } finally {
    koffi.free(buffer);
  }
}

function getBlockProto(args: readonly ObjCValueType[], returns: ObjCValueType): TypeObject {
  const key = `${returns}(${args.join(',')})`;
  const cached = blockProtos.get(key);
  if (cached) return cached;
  const proto = koffi.proto(null, blockResultType(returns), ['void *', ...args.map(blockArgumentType)]);
  blockProtos.set(key, proto);
  return proto;
}

function isPointerReturn(type: ObjCValueType): boolean {
  return type === 'id' || type === 'class' || type === 'sel' || type === 'pointer';
}

/** True when the native Apple block helper is loaded. */
export function nativeBlocksAvailable(): boolean {
  return loadHelper() !== null;
}

/**
 * Create a real reference-counted Objective-C block.
 * `args` describes the user-visible block arguments (the hidden block
 * argument is added automatically).
 */
export function createNativeBlock(
  callback: (...args: any[]) => any,
  args: readonly ObjCValueType[] = ['id'],
  returns: ObjCValueType = 'void'
): Pointer {
  const lib = loadHelper();
  if (!lib) {
    throw new Error('[GeaFFI] The native Apple block helper is not loaded. Build it with npm run build:apple-block.');
  }
  drainDisposedCallbacks(lib);

  const proto = getBlockProto(args, returns);
  const pointerReturn = isPointerReturn(returns);
  const registered = koffi.register((...values: any[]) => {
    const result = callback(...values.slice(1));
    if (pointerReturn) {
      if (result === null || result === undefined) return null;
      if (result instanceof Pointer) return requireNativeAddress(result, 'block return value');
    }
    return result;
  }, koffi.pointer(proto));
  const address = lib.create(registered);
  if (!address) {
    koffi.unregister(registered);
    throw new Error('[GeaFFI] Could not allocate a native Objective-C block.');
  }

  handles.set(BigInt(address), registered);
  return adoptNativePointer(address);
}

/** Release a block created by createNativeBlock and unregister its callback once disposed. */
export function releaseNativeBlock(pointer: Pointer): boolean {
  if (!isNativePointer(pointer) || pointer.isNull()) return false;
  const address = pointer.address;
  const registered = handles.get(address);
  if (registered === undefined) return false;
  handles.delete(address);
  revokeNativePointer(pointer);

  const lib = loadHelper();
  if (!lib) {
    koffi.unregister(registered);
    return true;
  }

  if (lib.drainDisposed) {
    // Queue before _Block_release: if refcount drops to 0 immediately,
    // dispose_helper pushes the invoke pointer and drainDisposedCallbacks
    // unregisters it right away. If Foundation/GCD still retains a copy,
    // the trampoline stays alive until the final release runs dispose_helper.
    const invokeKey = BigInt(koffi.address(registered));
    pendingDisposeByInvoke.set(invokeKey, registered);
    lib.free(address);
    drainDisposedCallbacks(lib);
  } else {
    lib.free(address);
    koffi.unregister(registered);
  }
  return true;
}
