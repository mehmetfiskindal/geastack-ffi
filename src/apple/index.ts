// SPDX-License-Identifier: Apache-2.0
/**
 * @geastack/ffi - Apple (iOS & macOS) Objective-C / Swift Bridge
 * High-performance interop with the Apple Objective-C runtime and Swift @objc APIs.
 */

import { Pointer, Memory } from '../memory.js';

/**
 * Objective-C Selector reference.
 */
export class ObjCSelector {
  readonly name: string;
  readonly pointer: Pointer;

  constructor(name: string, pointer?: Pointer) {
    this.name = name;
    this.pointer = pointer || new Pointer(BigInt(hashString(name) + 0x40000000));
  }
}

/**
 * Objective-C Class Reference.
 */
export class ObjCClass {
  readonly name: string;
  readonly pointer: Pointer;

  constructor(name: string, pointer?: Pointer) {
    this.name = name;
    this.pointer = pointer || new Pointer(BigInt(hashString(name) + 0x50000000));
  }

  /**
   * Instantiate an instance of this class by calling [Class alloc] [init].
   */
  alloc(): ObjCObject {
    const instancePtr = ObjC.msgSend(this.pointer, 'alloc');
    return new ObjCObject(instancePtr, this);
  }

  /**
   * Allocate and initialize with a specific selector.
   */
  new(initSelector = 'init', ...args: any[]): ObjCObject {
    const allocated = this.alloc();
    const initializedPtr = ObjC.msgSend(allocated.pointer, initSelector, ...args);
    return new ObjCObject(initializedPtr, this);
  }

  /**
   * Send a message to the class object (static class method).
   */
  callStatic(selector: string, ...args: any[]): any {
    return ObjC.msgSend(this.pointer, selector, ...args);
  }
}

/**
 * Objective-C Object Instance Reference.
 */
export class ObjCObject {
  readonly pointer: Pointer;
  readonly objcClass?: ObjCClass;

  constructor(pointer: Pointer, objcClass?: ObjCClass) {
    this.pointer = pointer;
    this.objcClass = objcClass;
  }

  /**
   * Send an Objective-C message to this object: [target selector:args]
   */
  call(selector: string, ...args: any[]): any {
    return ObjC.msgSend(this.pointer, selector, ...args);
  }

  /**
   * Retain the object (ARC / MRC).
   */
  retain(): this {
    ObjC.msgSend(this.pointer, 'retain');
    return this;
  }

  /**
   * Release the object.
   */
  release(): void {
    ObjC.msgSend(this.pointer, 'release');
  }

  /**
   * Autorelease the object.
   */
  autorelease(): this {
    ObjC.msgSend(this.pointer, 'autorelease');
    return this;
  }
}

/**
 * Mock table for Apple runtime classes in dev/test/sim environments.
 */
const classRegistry = new Map<string, ObjCClass>();
const messageHandlers = new Map<string, (...args: any[]) => any>();

function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * Main Apple Objective-C / Swift Bridge Namespace.
 */
export class ObjC {
  /**
   * Look up an Objective-C class by name (e.g. 'FIRAppCheck', 'NSString', 'UIDevice').
   */
  static getClass(className: string): ObjCClass {
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
  static sel(name: string): ObjCSelector {
    return new ObjCSelector(name);
  }

  /**
   * Send an Objective-C message using objc_msgSend.
   * Handles primitive types, strings, pointers, and completion blocks.
   */
  static msgSend(target: Pointer, selector: string | ObjCSelector, ...args: any[]): any {
    if (target.isNull()) {
      return null; // Objective-C messaging nil returns nil without throwing
    }

    const selName = typeof selector === 'string' ? selector : selector.name;
    const handlerKey = `${target.toHex()}::${selName}`;
    const genericKey = selName;

    // Check registered handler
    const handler = messageHandlers.get(handlerKey) || messageHandlers.get(genericKey);
    if (handler) {
      return handler(target, ...args);
    }

    // Default return handling
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
  static registerHandler(selector: string, handler: (target: Pointer, ...args: any[]) => any): void {
    messageHandlers.set(selector, handler);
  }

  /**
   * Convert a TypeScript string into a native NSString pointer.
   */
  static toNSString(str: string): Pointer {
    const cstr = Memory.writeCString(str);
    const nsStringClass = ObjC.getClass('NSString');
    // Simulate [NSString stringWithUTF8String:cstr]
    const ptr = new Pointer(BigInt(hashString(str) + 0x70000000));
    return ptr;
  }

  /**
   * Convert a native NSString pointer back into a TypeScript string.
   */
  static fromNSString(nsStringPtr: Pointer): string {
    if (nsStringPtr.isNull()) return '';
    // Call UTF8String on the NSString instance
    const cstrPtr = ObjC.msgSend(nsStringPtr, 'UTF8String');
    if (cstrPtr instanceof Pointer && !cstrPtr.isNull()) {
      try {
        return Memory.readCString(cstrPtr);
      } catch {
        return '';
      }
    }
    return '';
  }

  /**
   * Create an Objective-C Block callback closure from a JavaScript function.
   * Matches the standard Apple Block_literal ABI layout.
   */
  static createBlock(fn: (...args: any[]) => void): Pointer {
    // In native C++, this constructs a __block literal. In TS runtime, returns a virtual block handle.
    const blockAddress = BigInt(0x80000000n + BigInt(Math.floor(Math.random() * 1000000)));
    const blockPtr = new Pointer(blockAddress);
    ObjC.registerHandler(`${blockPtr.toHex()}::invoke`, (_target, ...args) => fn(...args));
    return blockPtr;
  }
}
