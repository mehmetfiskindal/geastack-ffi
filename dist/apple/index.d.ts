/**
 * @geastack/ffi - Apple (iOS & macOS) Objective-C / Swift Bridge
 *
 * On a macOS host the Objective-C runtime is driven directly through
 * `objc_getClass`, `sel_registerName`, and typed `objc_msgSend` trampolines.
 * On every other platform the same API keeps the deterministic in-process
 * simulation used by unit tests and previews.
 */
import { Pointer } from '../memory.js';
import { ObjCSignature, ObjCValueType } from './runtime.js';
export type { ObjCSignature, ObjCValueType } from './runtime.js';
/**
 * Objective-C Selector reference.
 */
export declare class ObjCSelector {
    readonly name: string;
    readonly pointer: Pointer;
    readonly isNative: boolean;
    constructor(name: string, pointer?: Pointer);
}
/**
 * Objective-C Class Reference.
 */
export declare class ObjCClass {
    readonly name: string;
    readonly pointer: Pointer;
    /** True when the class was found in the live Objective-C runtime. */
    readonly exists: boolean;
    readonly isNativeClass: boolean;
    constructor(name: string, pointer?: Pointer, exists?: boolean, isNativeClass?: boolean);
    /**
     * Instantiate an instance of this class by calling [Class alloc].
     */
    alloc(): ObjCObject;
    /**
     * Allocate and initialize with a specific selector.
     * Native classes only accept the no-argument form here; use [ObjC.send] for
     * initializers that take arguments, such as `initWithUTF8String:`.
     */
    new(initSelector?: string, ...args: any[]): ObjCObject;
    /**
     * Send a message to the class object (static class method) with no arguments.
     */
    callStatic(selector: string, ...args: any[]): any;
    /**
     * Send a message to the class object with an explicit Objective-C signature.
     */
    callStaticTyped(selector: string, signature: ObjCSignature, ...args: any[]): any;
}
/**
 * Objective-C Object Instance Reference.
 */
export declare class ObjCObject {
    readonly pointer: Pointer;
    readonly objcClass?: ObjCClass;
    constructor(pointer: Pointer, objcClass?: ObjCClass);
    /**
     * Send an Objective-C message to this object with no arguments.
     */
    call(selector: string, ...args: any[]): any;
    /**
     * Send a message with an explicit Objective-C signature.
     */
    callTyped(selector: string, signature: ObjCSignature, ...args: any[]): any;
    /**
     * Retain the object (MRC; in ARC code the compiler inserts this).
     */
    retain(): this;
    /**
     * Release the object.
     */
    release(): void;
    /**
     * Autorelease the object.
     */
    autorelease(): this;
}
export type ObjCMessageHandler = (target: Pointer, ...args: any[]) => any;
/**
 * Main Apple Objective-C / Swift Bridge Namespace.
 */
export declare class ObjC {
    /**
     * True when this process is on macOS and the live Objective-C runtime loaded.
     */
    static get runtimeAvailable(): boolean;
    /**
     * Look up an Objective-C class by name (e.g. 'FIRAppCheck', 'NSString', 'UIDevice').
     *
     * On macOS a class that exists in the live runtime is returned with a real
     * `Class` pointer. A class that is absent (for example UIKit classes on macOS)
     * falls back to a simulated reference so handlers and previews keep working.
     */
    static getClass(className: string): ObjCClass;
    /**
     * Register or lookup a selector name (sel_registerName).
     */
    static sel(name: string): ObjCSelector;
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
    static send(target: Pointer | ObjCObject | ObjCClass, selector: string | ObjCSelector, signature: ObjCSignature, ...args: any[]): any;
    /**
     * Convenience wrapper around [ObjC.send] for class methods.
     */
    static sendClass(className: string, selector: string, signature: ObjCSignature, ...args: any[]): any;
    /**
     * Send an Objective-C message using objc_msgSend.
     *
     * Registered handlers always win. For live native objects only the no-argument
     * memory-management and description selectors are inferred; anything with
     * arguments must use [ObjC.send] so the C ABI is unambiguous.
     */
    static msgSend(target: Pointer, selector: string | ObjCSelector, ...args: any[]): any;
    /**
     * Register a custom handler for simulating an Objective-C selector in tests.
     */
    static registerHandler(selector: string, handler: ObjCMessageHandler): void;
    /**
     * Remove a registered simulation handler.
     */
    static unregisterHandler(selector: string): void;
    /**
     * Convert a TypeScript string into a native NSString pointer.
     *
     * On macOS this returns a +1 retained NSString; call [ObjC.release] when done.
     * On other platforms it returns a simulated pointer.
     */
    static toNSString(str: string): Pointer;
    /**
     * Convert a native NSString pointer back into a TypeScript string.
     */
    static fromNSString(nsStringPtr: Pointer): string;
    /** Retain a live Objective-C object and return the same pointer. */
    static retain(pointer: Pointer): Pointer;
    /** Release a live Objective-C object. */
    static release(pointer: Pointer): void;
    /** The live runtime class name of an object, or an empty string. */
    static objectClassName(pointer: Pointer): string;
    /**
     * Create an Objective-C Block callback closure from a JavaScript function.
     *
     * This is a simulated block handle. Native blocks are produced by the C++
     * backend (`gea_ffi_apple_create_block`), not by the Node host loader.
     */
    /** True when the native global-block helper is loaded. */
    static get nativeBlocksAvailable(): boolean;
    /**
     * Create a real Objective-C global block.
     * `args` describes the user-visible block arguments; the hidden block
     * argument is added automatically. Release with releaseNativeBlock().
     */
    static createNativeBlock(fn: (...args: any[]) => void, args?: ObjCValueType[]): Pointer;
    /** Free a block created by createNativeBlock(). */
    static releaseNativeBlock(pointer: Pointer): boolean;
    static createBlock(fn: (...args: any[]) => void): Pointer;
}
//# sourceMappingURL=index.d.ts.map