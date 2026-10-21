// SPDX-License-Identifier: Apache-2.0
/**
 * Real Objective-C runtime access for macOS hosts.
 *
 * This module is loaded lazily: importing it on a non-Apple platform is safe,
 * and `appleRuntime()` returns `null` instead of touching the dynamic loader.
 *
 * The same runtime (`objc_msgSend`, `objc_getClass`, `sel_registerName`) is the
 * one used by iOS, so the message-sending contract verified here also applies
 * to the iOS native backend in `src/native/gea_ffi_apple.mm`.
 */
import koffi from 'koffi';
import { Pointer } from '../memory.js';
import { adoptNativePointer } from '../native-pointers.js';
const FOUNDATION_PATH = '/System/Library/Frameworks/Foundation.framework/Foundation';
const OBJC_PATH = 'libobjc.A.dylib';
function resultType(type) {
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
            return 'void';
        default:
            throw new Error(`[GeaFFI] Unknown Objective-C return type '${String(type)}'.`);
    }
}
function argumentType(type) {
    if (type === 'string')
        return 'const char *';
    if (type === 'void') {
        throw new Error('[GeaFFI] void is not a valid Objective-C argument type.');
    }
    return resultType(type);
}
function marshalArgument(type, value) {
    switch (type) {
        case 'id':
        case 'class':
        case 'sel':
        case 'pointer': {
            if (value === null || value === undefined)
                return null;
            if (value instanceof Pointer) {
                if (value.isNull())
                    return null;
                return value.address;
            }
            throw new Error(`[GeaFFI] Expected a Pointer for Objective-C ${type} argument.`);
        }
        case 'string':
            if (value === null || value === undefined)
                return null;
            if (typeof value !== 'string') {
                throw new Error('[GeaFFI] Expected a JavaScript string for an Objective-C string argument.');
            }
            return value;
        case 'int':
        case 'uint':
        case 'float':
        case 'double':
            if (typeof value !== 'number' || !Number.isFinite(value)) {
                throw new Error(`[GeaFFI] Expected a finite number for Objective-C ${type} argument.`);
            }
            return value;
        case 'long':
        case 'ulong':
            if (typeof value === 'bigint')
                return value;
            if (typeof value === 'number' && Number.isInteger(value))
                return BigInt(value);
            throw new Error(`[GeaFFI] Expected a bigint for Objective-C ${type} argument.`);
        case 'bool':
            if (typeof value !== 'boolean') {
                throw new Error('[GeaFFI] Expected a boolean for an Objective-C bool argument.');
            }
            return value;
        default:
            throw new Error(`[GeaFFI] Unknown Objective-C argument type '${String(type)}'.`);
    }
}
function marshalResult(type, value) {
    switch (type) {
        case 'void':
            return undefined;
        case 'id':
        case 'class':
        case 'sel':
        case 'pointer':
            if (value === null || value === undefined)
                return Pointer.NULL;
            return adoptNativePointer(value);
        case 'string':
            return value === null || value === undefined ? '' : String(value);
        case 'int':
        case 'uint':
        case 'float':
        case 'double':
            return Number(value);
        case 'long':
        case 'ulong':
            return typeof value === 'bigint' ? value : BigInt(value);
        case 'bool':
            return Boolean(value);
        default:
            throw new Error(`[GeaFFI] Unknown Objective-C return type '${String(type)}'.`);
    }
}
function zeroResult(type) {
    switch (type) {
        case 'void':
            return undefined;
        case 'string':
            return '';
        case 'id':
        case 'class':
        case 'sel':
        case 'pointer':
            return Pointer.NULL;
        case 'long':
        case 'ulong':
            return 0n;
        case 'bool':
            return false;
        default:
            return 0;
    }
}
export class AppleRuntime {
    foundationPath = FOUNDATION_PATH;
    objc;
    foundation;
    getClassFn;
    getSelectorFn;
    classNameFn;
    classCache = new Map();
    selectorCache = new Map();
    sendCache = new Map();
    constructor() {
        try {
            this.foundation = koffi.load(FOUNDATION_PATH);
        }
        catch {
            this.foundation = null;
        }
        this.objc = koffi.load(OBJC_PATH);
        this.getClassFn = this.objc.func('objc_getClass', 'void *', ['const char *']);
        this.getSelectorFn = this.objc.func('sel_registerName', 'void *', ['const char *']);
        this.classNameFn = this.objc.func('object_getClassName', 'const char *', ['void *']);
    }
    /** Raw pointer to an Objective-C class, or null when the class is not registered. */
    classNamed(name) {
        if (this.classCache.has(name)) {
            return this.classCache.get(name) ?? null;
        }
        const raw = this.getClassFn(name);
        const value = raw === null || raw === undefined ? null : BigInt(raw);
        const result = value === 0n ? null : value;
        this.classCache.set(name, result);
        return result;
    }
    /** Raw pointer to a registered selector. */
    selectorNamed(name) {
        const cached = this.selectorCache.get(name);
        if (cached !== undefined)
            return cached;
        const raw = this.getSelectorFn(name);
        const value = raw === null || raw === undefined ? 0n : BigInt(raw);
        this.selectorCache.set(name, value);
        return value;
    }
    /** The class name of a live object, as reported by the runtime. */
    objectClassName(target) {
        if (target.isNull())
            return '';
        const value = this.classNameFn(target.address);
        return value === null || value === undefined ? '' : String(value);
    }
    /**
     * Send a message with an explicit C signature.
     *
     * Objective-C has no runtime type information for method arguments, so the
     * caller must describe the argument and return types exactly as the compiled
     * method expects them. Koffi then builds a `objc_msgSend` trampoline for that
     * signature.
     */
    send(target, selector, signature, args) {
        if (target.isNull()) {
            return zeroResult(signature.returns);
        }
        if (signature.args.length !== args.length) {
            throw new Error(`[GeaFFI] Objective-C selector '${selector}' expects ${signature.args.length} argument(s), received ${args.length}.`);
        }
        const selectorAddress = this.selectorNamed(selector);
        if (selectorAddress === 0n) {
            throw new Error(`[GeaFFI] Could not register Objective-C selector '${selector}'.`);
        }
        const fn = this.msgSend(signature);
        const marshaled = args.map((value, index) => marshalArgument(signature.args[index], value));
        const result = fn(target.address, selectorAddress, ...marshaled);
        return marshalResult(signature.returns, result);
    }
    msgSend(signature) {
        const key = `${signature.returns}:${signature.args.join(',')}`;
        const cached = this.sendCache.get(key);
        if (cached)
            return cached;
        const argumentTypes = ['void *', 'void *', ...signature.args.map(argumentType)];
        const fn = this.objc.func('objc_msgSend', resultType(signature.returns), argumentTypes);
        this.sendCache.set(key, fn);
        return fn;
    }
}
let runtime;
/** True when this process is running on macOS and the Objective-C runtime loaded. */
export function appleRuntimeAvailable() {
    return appleRuntime() !== null;
}
/**
 * Load the Objective-C runtime once. Returns null on non-Apple platforms.
 * A load failure is remembered, so a broken runtime does not retry per call.
 */
export function appleRuntime() {
    if (runtime !== undefined)
        return runtime;
    if (typeof process === 'undefined' || process.platform !== 'darwin') {
        runtime = null;
        return runtime;
    }
    try {
        runtime = new AppleRuntime();
    }
    catch {
        runtime = null;
    }
    return runtime;
}
//# sourceMappingURL=runtime.js.map