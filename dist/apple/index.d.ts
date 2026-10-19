/**
 * @geastack/ffi - Apple (iOS & macOS) Objective-C / Swift Bridge
 * High-performance interop with the Apple Objective-C runtime and Swift @objc APIs.
 */
import { Pointer } from '../memory.js';
/**
 * Objective-C Selector reference.
 */
export declare class ObjCSelector {
    readonly name: string;
    readonly pointer: Pointer;
    constructor(name: string, pointer?: Pointer);
}
/**
 * Objective-C Class Reference.
 */
export declare class ObjCClass {
    readonly name: string;
    readonly pointer: Pointer;
    constructor(name: string, pointer?: Pointer);
    /**
     * Instantiate an instance of this class by calling [Class alloc] [init].
     */
    alloc(): ObjCObject;
    /**
     * Allocate and initialize with a specific selector.
     */
    new(initSelector?: string, ...args: any[]): ObjCObject;
    /**
     * Send a message to the class object (static class method).
     */
    callStatic(selector: string, ...args: any[]): any;
}
/**
 * Objective-C Object Instance Reference.
 */
export declare class ObjCObject {
    readonly pointer: Pointer;
    readonly objcClass?: ObjCClass;
    constructor(pointer: Pointer, objcClass?: ObjCClass);
    /**
     * Send an Objective-C message to this object: [target selector:args]
     */
    call(selector: string, ...args: any[]): any;
    /**
     * Retain the object (ARC / MRC).
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
/**
 * Main Apple Objective-C / Swift Bridge Namespace.
 */
export declare class ObjC {
    /**
     * Look up an Objective-C class by name (e.g. 'FIRAppCheck', 'NSString', 'UIDevice').
     */
    static getClass(className: string): ObjCClass;
    /**
     * Register or lookup a selector name (sel_registerName).
     */
    static sel(name: string): ObjCSelector;
    /**
     * Send an Objective-C message using objc_msgSend.
     * Handles primitive types, strings, pointers, and completion blocks.
     */
    static msgSend(target: Pointer, selector: string | ObjCSelector, ...args: any[]): any;
    /**
     * Register a custom handler for simulating an Objective-C selector in tests.
     */
    static registerHandler(selector: string, handler: (target: Pointer, ...args: any[]) => any): void;
    /**
     * Convert a TypeScript string into a native NSString pointer.
     */
    static toNSString(str: string): Pointer;
    /**
     * Convert a native NSString pointer back into a TypeScript string.
     */
    static fromNSString(nsStringPtr: Pointer): string;
    /**
     * Create an Objective-C Block callback closure from a JavaScript function.
     * Matches the standard Apple Block_literal ABI layout.
     */
    static createBlock(fn: (...args: any[]) => void): Pointer;
}
//# sourceMappingURL=index.d.ts.map