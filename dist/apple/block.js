// SPDX-License-Identifier: Apache-2.0
/**
 * Native Objective-C global blocks backed by a tiny C helper.
 *
 * The helper builds a BLOCK_IS_GLOBAL layout whose invoke pointer is a koffi
 * callback. Blocks created here are real Objective-C blocks and can be passed
 * to Foundation methods; release them with releaseNativeBlock().
 */
import koffi from 'koffi';
import { adoptNativePointer, isNativePointer } from '../native-pointers.js';
const handles = new Map();
let helper;
function blockArgumentType(type) {
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
function loadHelper() {
    if (helper !== undefined)
        return helper;
    helper = null;
    if (process.platform !== 'darwin')
        return helper;
    const candidates = [
        process.env.GEA_FFI_APPLE_BLOCK_LIBRARY,
        `${process.cwd()}/build/apple-block/libgea_apple_block.dylib`,
    ].filter((candidate) => Boolean(candidate));
    for (const candidate of candidates) {
        try {
            const library = koffi.load(candidate);
            helper = {
                create: library.func('gea_ffi_block_create', 'void *', ['void *']),
                free: library.func('gea_ffi_block_free', 'void', ['void *']),
            };
            return helper;
        }
        catch {
            // Try the next candidate.
        }
    }
    return helper;
}
/** True when the native Apple block helper is loaded. */
export function nativeBlocksAvailable() {
    return loadHelper() !== null;
}
/**
 * Create a real global Objective-C block.
 * `args` describes the user-visible block arguments (the hidden block
 * argument is added automatically).
 */
export function createNativeBlock(callback, args = ['id']) {
    const lib = loadHelper();
    if (!lib) {
        throw new Error('[GeaFFI] The native Apple block helper is not loaded. Build it with npm run build:apple-block.');
    }
    const proto = koffi.proto(null, 'void', ['void *', ...args.map(blockArgumentType)]);
    const registered = koffi.register((...values) => {
        callback(...values.slice(1));
    }, koffi.pointer(proto));
    const address = lib.create(registered);
    if (!address) {
        koffi.unregister(registered);
        throw new Error('[GeaFFI] Could not allocate a native Objective-C block.');
    }
    handles.set(BigInt(address), registered);
    return adoptNativePointer(address);
}
/** Free a block created by createNativeBlock and unregister its callback. */
export function releaseNativeBlock(pointer) {
    if (!isNativePointer(pointer) || pointer.isNull())
        return false;
    const address = pointer.address;
    const registered = handles.get(address);
    if (registered === undefined)
        return false;
    handles.delete(address);
    koffi.unregister(registered);
    loadHelper()?.free(address);
    return true;
}
//# sourceMappingURL=block.js.map