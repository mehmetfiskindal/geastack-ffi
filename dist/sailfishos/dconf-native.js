// SPDX-License-Identifier: Apache-2.0
/**
 * Koffi binding for the native libdconf bridge.
 */
import koffi from 'koffi';
const DCONF_KIND = {
    BOOL: 0,
    INT32: 1,
    UINT32: 2,
    DOUBLE: 3,
    STRING: 4,
};
const DconfUnion = koffi.union({
    b: 'uint8',
    i32: 'int32',
    u32: 'uint32',
    d: 'double',
    str: 'void *',
});
const DconfValue = koffi.struct({
    kind: 'int32',
    as: DconfUnion,
});
const UNION_OFFSET = koffi.offsetof(DconfValue, 'as');
function candidatePaths() {
    const names = process.platform === 'darwin'
        ? ['libgea_ffi_dconf.dylib']
        : ['libgea_ffi_dconf.so'];
    const candidates = [];
    const configured = process.env.GEA_FFI_DCONF_LIBRARY;
    if (configured)
        candidates.push(configured);
    for (const name of names)
        candidates.push(`${process.cwd()}/build/dconf-native/${name}`);
    return candidates;
}
function loadLibrary() {
    for (const libraryPath of candidatePaths()) {
        try {
            const lib = koffi.load(libraryPath);
            return {
                available: lib.func('gea_ffi_dconf_available', 'bool', []),
                read: lib.func('gea_ffi_dconf_read', 'int32', ['const char *', koffi.pointer(DconfValue)]),
                write: lib.func('gea_ffi_dconf_write', 'int32', ['const char *', koffi.pointer(DconfValue)]),
                reset: lib.func('gea_ffi_dconf_reset', 'int32', ['const char *']),
                lastError: lib.func('gea_ffi_dconf_last_error', 'const char *', []),
                free: lib.func('gea_ffi_dconf_free', 'void', ['void *']),
            };
        }
        catch {
            // Try the next path.
        }
    }
    return null;
}
function classify(value) {
    if (typeof value === 'string')
        return { kind: DCONF_KIND.STRING, value };
    if (typeof value === 'boolean')
        return { kind: DCONF_KIND.BOOL, value };
    if (typeof value === 'number') {
        if (Number.isInteger(value) && value >= -2147483648 && value <= 2147483647) {
            return { kind: DCONF_KIND.INT32, value };
        }
        if (Number.isInteger(value) && value >= 0 && value <= 4294967295) {
            return { kind: DCONF_KIND.UINT32, value };
        }
        return { kind: DCONF_KIND.DOUBLE, value };
    }
    throw new Error(`[GeaFFI:DConf] Unsupported value ${String(value)}.`);
}
function allocCString(value) {
    const encoded = new TextEncoder().encode(value);
    const pointer = koffi.alloc('char', encoded.length + 1);
    koffi.encode(pointer, 'char', [...encoded, 0], encoded.length + 1);
    return pointer;
}
export class NativeDConf {
    library;
    constructor(library) {
        this.library = library;
    }
    get available() {
        return this.library.available();
    }
    read(key) {
        const pointer = koffi.alloc(DconfValue, 1);
        try {
            const status = this.library.read(key, pointer);
            if (status === 1)
                return null;
            if (status !== 0) {
                throw new Error(`[GeaFFI:DConf] Reading ${key} failed: ${this.library.lastError()}`);
            }
            const kind = Number(koffi.decode(pointer, 0, 'int32'));
            switch (kind) {
                case DCONF_KIND.BOOL:
                    return Number(koffi.decode(pointer, UNION_OFFSET, 'uint8')) !== 0;
                case DCONF_KIND.INT32:
                    return Number(koffi.decode(pointer, UNION_OFFSET, 'int32'));
                case DCONF_KIND.UINT32:
                    return Number(koffi.decode(pointer, UNION_OFFSET, 'uint32'));
                case DCONF_KIND.DOUBLE:
                    return Number(koffi.decode(pointer, UNION_OFFSET, 'double'));
                case DCONF_KIND.STRING: {
                    const stringPointer = koffi.decode(pointer, UNION_OFFSET, 'void *');
                    if (stringPointer === null || stringPointer === undefined)
                        return '';
                    const text = String(koffi.decode(stringPointer, 'char', -1));
                    this.library.free(BigInt(stringPointer));
                    return text;
                }
                default:
                    throw new Error(`[GeaFFI:DConf] Unsupported value kind ${kind}.`);
            }
        }
        finally {
            koffi.free(pointer);
        }
    }
    reset(key) {
        const status = this.library.reset(key);
        if (status !== 0) {
            throw new Error(`[GeaFFI:DConf] Resetting ${key} failed: ${this.library.lastError()}`);
        }
    }
    write(key, value) {
        const entry = classify(value);
        const pointer = koffi.alloc(DconfValue, 1);
        let stringPointer = null;
        try {
            koffi.encode(pointer, 0, 'int32', entry.kind);
            switch (entry.kind) {
                case DCONF_KIND.STRING:
                    stringPointer = allocCString(String(entry.value));
                    koffi.encode(pointer, UNION_OFFSET, 'void *', stringPointer);
                    break;
                case DCONF_KIND.BOOL:
                    koffi.encode(pointer, UNION_OFFSET, 'uint8', entry.value ? 1 : 0);
                    break;
                case DCONF_KIND.INT32:
                    koffi.encode(pointer, UNION_OFFSET, 'int32', Number(entry.value));
                    break;
                case DCONF_KIND.UINT32:
                    koffi.encode(pointer, UNION_OFFSET, 'uint32', Number(entry.value));
                    break;
                case DCONF_KIND.DOUBLE:
                    koffi.encode(pointer, UNION_OFFSET, 'double', Number(entry.value));
                    break;
                default:
                    throw new Error(`[GeaFFI:DConf] Unsupported value kind ${entry.kind}.`);
            }
            const status = this.library.write(key, pointer);
            if (status !== 0) {
                throw new Error(`[GeaFFI:DConf] Writing ${key} failed: ${this.library.lastError()}`);
            }
        }
        finally {
            if (stringPointer !== null)
                koffi.free(stringPointer);
            koffi.free(pointer);
        }
    }
}
function createBackend() {
    if (typeof process === 'undefined' || (process.platform !== 'linux' && process.platform !== 'darwin')) {
        return null;
    }
    const library = loadLibrary();
    return library ? new NativeDConf(library) : null;
}
export const nativeDConf = createBackend();
//# sourceMappingURL=dconf-native.js.map