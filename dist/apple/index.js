// SPDX-License-Identifier: Apache-2.0
/**
 * @geastack/ffi - Apple (iOS & macOS) Objective-C / Swift Bridge
 *
 * On a macOS host the Objective-C runtime is driven directly through
 * `objc_getClass`, `sel_registerName`, and typed `objc_msgSend` trampolines.
 * On every other platform the same API keeps the deterministic in-process
 * simulation used by unit tests and previews.
 */
import { Pointer, Memory } from '../memory.js';
import { adoptNativePointer, isNativePointer, requireNativeAddress } from '../native-pointers.js';
import { appleRuntime, appleRuntimeAvailable } from './runtime.js';
/**
 * Objective-C Selector reference.
 */
export class ObjCSelector {
    name;
    pointer;
    isNative;
    constructor(name, pointer) {
        this.name = name;
        this.isNative = pointer !== undefined && !pointer.isNull();
        this.pointer = pointer || new Pointer(BigInt(hashString(name) + 0x40000000));
    }
}
/**
 * Objective-C Class Reference.
 */
export class ObjCClass {
    name;
    pointer;
    /** True when the class was found in the live Objective-C runtime. */
    exists;
    isNativeClass;
    constructor(name, pointer, exists = false, isNativeClass = false) {
        this.name = name;
        this.exists = exists;
        this.isNativeClass = isNativeClass;
        this.pointer = pointer || new Pointer(BigInt(hashString(name) + 0x50000000));
    }
    /**
     * Instantiate an instance of this class by calling [Class alloc].
     */
    alloc() {
        if (this.isNativeClass) {
            const instancePtr = ObjC.send(this.pointer, 'alloc', { args: [], returns: 'id' });
            return new ObjCObject(instancePtr, this);
        }
        const instancePtr = ObjC.msgSend(this.pointer, 'alloc');
        return new ObjCObject(instancePtr, this);
    }
    /**
     * Allocate and initialize with a specific selector.
     * Native classes only accept the no-argument form here; use [ObjC.send] for
     * initializers that take arguments, such as `initWithUTF8String:`.
     */
    new(initSelector = 'init', ...args) {
        const allocated = this.alloc();
        if (this.isNativeClass) {
            if (args.length > 0) {
                throw new Error(`[GeaFFI] Use ObjC.send(${this.name}, '${initSelector}', { args: [...], returns: 'id' }, ...) for initializers with arguments.`);
            }
            const initializedPtr = ObjC.send(allocated.pointer, initSelector, { args: [], returns: 'id' });
            return new ObjCObject(initializedPtr, this);
        }
        const initializedPtr = ObjC.msgSend(allocated.pointer, initSelector, ...args);
        return new ObjCObject(initializedPtr, this);
    }
    /**
     * Send a message to the class object (static class method) with no arguments.
     */
    callStatic(selector, ...args) {
        if (this.isNativeClass) {
            if (args.length > 0) {
                throw new Error(`[GeaFFI] Use ObjC.send(${this.name}, '${selector}', { args: [...], returns: 'id' }, ...) for class methods with arguments.`);
            }
            return ObjC.send(this.pointer, selector, { args: [], returns: 'id' });
        }
        return ObjC.msgSend(this.pointer, selector, ...args);
    }
    /**
     * Send a message to the class object with an explicit Objective-C signature.
     */
    callStaticTyped(selector, signature, ...args) {
        return ObjC.send(this.pointer, selector, signature, ...args);
    }
}
/**
 * Objective-C Object Instance Reference.
 */
export class ObjCObject {
    pointer;
    objcClass;
    constructor(pointer, objcClass) {
        this.pointer = pointer;
        this.objcClass = objcClass;
    }
    /**
     * Send an Objective-C message to this object with no arguments.
     */
    call(selector, ...args) {
        if (!this.pointer.isNull() && isNativePointer(this.pointer)) {
            if (args.length > 0) {
                throw new Error(`[GeaFFI] Use object.callTyped('${selector}', { args: [...], returns: 'id' }, ...) for methods with arguments.`);
            }
            return ObjC.send(this.pointer, selector, { args: [], returns: 'id' });
        }
        return ObjC.msgSend(this.pointer, selector, ...args);
    }
    /**
     * Send a message with an explicit Objective-C signature.
     */
    callTyped(selector, signature, ...args) {
        return ObjC.send(this.pointer, selector, signature, ...args);
    }
    /**
     * Retain the object (MRC; in ARC code the compiler inserts this).
     */
    retain() {
        ObjC.retain(this.pointer);
        return this;
    }
    /**
     * Release the object.
     */
    release() {
        ObjC.release(this.pointer);
    }
    /**
     * Autorelease the object.
     */
    autorelease() {
        if (isNativePointer(this.pointer) && !this.pointer.isNull()) {
            ObjC.send(this.pointer, 'autorelease', { args: [], returns: 'id' });
            return this;
        }
        ObjC.msgSend(this.pointer, 'autorelease');
        return this;
    }
}
/**
 * Mock table for Apple runtime classes in dev/test/sim environments.
 */
const classRegistry = new Map();
const messageHandlers = new Map();
function hashString(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash) + str.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
}
function asPointer(target) {
    if (target instanceof Pointer)
        return target;
    return target.pointer;
}
function selectorName(selector) {
    return typeof selector === 'string' ? selector : selector.name;
}
const NO_ARGUMENT_ID_SELECTORS = new Set([
    'alloc',
    'init',
    'retain',
    'autorelease',
    'copy',
    'mutableCopy',
    'description',
    'debugDescription',
    'self',
    'class',
    'processInfo',
    'defaultManager',
    'currentDevice',
    'currentThread',
    'standardUserDefaults',
]);
/**
 * Main Apple Objective-C / Swift Bridge Namespace.
 */
export class ObjC {
    /**
     * True when this process is on macOS and the live Objective-C runtime loaded.
     */
    static get runtimeAvailable() {
        return appleRuntimeAvailable();
    }
    /**
     * Look up an Objective-C class by name (e.g. 'FIRAppCheck', 'NSString', 'UIDevice').
     *
     * On macOS a class that exists in the live runtime is returned with a real
     * `Class` pointer. A class that is absent (for example UIKit classes on macOS)
     * falls back to a simulated reference so handlers and previews keep working.
     */
    static getClass(className) {
        const runtime = appleRuntime();
        if (runtime) {
            const raw = runtime.classNamed(className);
            const cached = classRegistry.get(className);
            if (raw !== null) {
                if (cached?.isNativeClass && cached.pointer.address === raw) {
                    return cached;
                }
                const cls = new ObjCClass(className, adoptNativePointer(raw), true, true);
                classRegistry.set(className, cls);
                return cls;
            }
            if (cached?.isNativeClass) {
                // The class disappeared only if the runtime was unloaded; retry next call.
                classRegistry.delete(className);
            }
        }
        let cls = classRegistry.get(className);
        if (!cls) {
            cls = new ObjCClass(className);
            classRegistry.set(className, cls);
        }
        return cls;
    }
    /**
     * Register or lookup a selector name (sel_registerName).
     */
    static sel(name) {
        const runtime = appleRuntime();
        if (runtime) {
            const raw = runtime.selectorNamed(name);
            if (raw !== 0n) {
                return new ObjCSelector(name, adoptNativePointer(raw));
            }
        }
        return new ObjCSelector(name);
    }
    /**
     * Send a message with an explicit Objective-C signature.
     *
     * @example
     * ```ts
     * const NSString = ObjC.getClass('NSString');
     * const str = ObjC.send(NSString, 'stringWithUTF8String:', { args: ['string'], returns: 'id' }, 'hello');
     * ObjC.send(str, 'UTF8String', { args: [], returns: 'string' }); // 'hello'
     * ```
     */
    static send(target, selector, signature, ...args) {
        const runtime = appleRuntime();
        if (!runtime) {
            throw new Error('[GeaFFI] The live Objective-C runtime is only available on macOS. Use ObjC.registerHandler for simulations.');
        }
        const pointer = asPointer(target);
        requireNativeAddress(pointer, 'Objective-C target');
        return runtime.send(pointer, selectorName(selector), signature, args);
    }
    /**
     * Convenience wrapper around [ObjC.send] for class methods.
     */
    static sendClass(className, selector, signature, ...args) {
        const cls = ObjC.getClass(className);
        if (!cls.exists) {
            throw new Error(`[GeaFFI] Objective-C class '${className}' is not registered in this process.`);
        }
        return ObjC.send(cls, selector, signature, ...args);
    }
    /**
     * Send an Objective-C message using objc_msgSend.
     *
     * Registered handlers always win. For live native objects only the no-argument
     * memory-management and description selectors are inferred; anything with
     * arguments must use [ObjC.send] so the C ABI is unambiguous.
     */
    static msgSend(target, selector, ...args) {
        if (target.isNull()) {
            return null; // Objective-C messaging nil returns nil without throwing
        }
        const selName = selectorName(selector);
        const handlerKey = `${target.toHex()}::${selName}`;
        const genericKey = selName;
        // Check registered handler
        const handler = messageHandlers.get(handlerKey) || messageHandlers.get(genericKey);
        if (handler) {
            return handler(target, ...args);
        }
        if (isNativePointer(target)) {
            if (args.length > 0) {
                throw new Error(`[GeaFFI] Objective-C selector '${selName}' has arguments; use ObjC.send(target, '${selName}', { args: [...], returns: ... }, ...).`);
            }
            if (selName === 'release') {
                ObjC.send(target, selName, { args: [], returns: 'void' });
                return undefined;
            }
            if (selName.startsWith('init') || NO_ARGUMENT_ID_SELECTORS.has(selName)) {
                return ObjC.send(target, selName, { args: [], returns: 'id' });
            }
            throw new Error(`[GeaFFI] Use ObjC.send(target, '${selName}', { args: [], returns: ... }) so the return ABI is known.`);
        }
        // Default return handling for simulated pointers
        if (selName === 'alloc') {
            return new Pointer(target.address + 0x1000n);
        }
        if (selName.startsWith('init')) {
            return target;
        }
        if (selName === 'retain' || selName === 'autorelease') {
            return target;
        }
        if (selName === 'release') {
            return undefined;
        }
        return new Pointer(0x60000000n);
    }
    /**
     * Register a custom handler for simulating an Objective-C selector in tests.
     */
    static registerHandler(selector, handler) {
        messageHandlers.set(selector, handler);
    }
    /**
     * Remove a registered simulation handler.
     */
    static unregisterHandler(selector) {
        messageHandlers.delete(selector);
    }
    /**
     * Convert a TypeScript string into a native NSString pointer.
     *
     * On macOS this returns a +1 retained NSString; call [ObjC.release] when done.
     * On other platforms it returns a simulated pointer.
     */
    static toNSString(str) {
        const runtime = appleRuntime();
        if (runtime) {
            const nsString = ObjC.getClass('NSString');
            if (nsString.exists) {
                const allocated = ObjC.send(nsString, 'alloc', { args: [], returns: 'id' });
                return ObjC.send(allocated, 'initWithUTF8String:', { args: ['string'], returns: 'id' }, str);
            }
        }
        const _cstr = Memory.writeCString(str);
        const _nsStringClass = ObjC.getClass('NSString');
        return new Pointer(BigInt(hashString(str) + 0x70000000));
    }
    /**
     * Convert a native NSString pointer back into a TypeScript string.
     */
    static fromNSString(nsStringPtr) {
        if (nsStringPtr.isNull())
            return '';
        if (isNativePointer(nsStringPtr)) {
            if (!appleRuntimeAvailable())
                return '';
            const cstr = ObjC.send(nsStringPtr, 'UTF8String', { args: [], returns: 'string' });
            return typeof cstr === 'string' ? cstr : '';
        }
        const cstrPtr = ObjC.msgSend(nsStringPtr, 'UTF8String');
        if (cstrPtr instanceof Pointer && !cstrPtr.isNull()) {
            try {
                return Memory.readCString(cstrPtr);
            }
            catch {
                return '';
            }
        }
        return '';
    }
    /** Retain a live Objective-C object and return the same pointer. */
    static retain(pointer) {
        if (isNativePointer(pointer) && !pointer.isNull() && appleRuntimeAvailable()) {
            return ObjC.send(pointer, 'retain', { args: [], returns: 'id' });
        }
        return pointer;
    }
    /** Release a live Objective-C object. */
    static release(pointer) {
        if (isNativePointer(pointer) && !pointer.isNull() && appleRuntimeAvailable()) {
            ObjC.send(pointer, 'release', { args: [], returns: 'void' });
        }
    }
    /** The live runtime class name of an object, or an empty string. */
    static objectClassName(pointer) {
        const runtime = appleRuntime();
        if (!runtime || pointer.isNull() || !isNativePointer(pointer))
            return '';
        return runtime.objectClassName(pointer);
    }
    /**
     * Create an Objective-C Block callback closure from a JavaScript function.
     *
     * This is a simulated block handle. Native blocks are produced by the C++
     * backend (`gea_ffi_apple_create_block`), not by the Node host loader.
     */
    static createBlock(fn) {
        const blockAddress = BigInt(0x80000000n + BigInt(Math.floor(Math.random() * 1000000)));
        const blockPtr = new Pointer(blockAddress);
        ObjC.registerHandler(`${blockPtr.toHex()}::invoke`, (_target, ...args) => fn(...args));
        return blockPtr;
    }
}
//# sourceMappingURL=index.js.map