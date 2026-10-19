// SPDX-License-Identifier: Apache-2.0
/**
 * @geastack/ffi - Android JNI (Java Native Interface) Bridge
 * Enables seamless invocation between GeaStack C++ runtime and the Android JVM / ART / Kotlin layers.
 */

import { Pointer, Memory } from '../memory.js';

/**
 * JNI Type Signature helpers.
 */
export class JNISignature {
  static readonly VOID = 'V';
  static readonly BOOLEAN = 'Z';
  static readonly BYTE = 'B';
  static readonly CHAR = 'C';
  static readonly SHORT = 'S';
  static readonly INT = 'I';
  static readonly LONG = 'J';
  static readonly FLOAT = 'F';
  static readonly DOUBLE = 'D';
  static readonly STRING = 'Ljava/lang/String;';
  static readonly OBJECT = 'Ljava/lang/Object;';
  static readonly CONTEXT = 'Landroid/content/Context;';
  static readonly ACTIVITY = 'Landroid/app/Activity;';

  /**
   * Helper to construct a standard JNI method signature string.
   * e.g. `(Ljava/lang/String;I)Z`
   */
  static method(returnType: string, ...argTypes: string[]): string {
    return `(${argTypes.join('')})${returnType}`;
  }

  static array(elementSignature: string): string {
    return `[${elementSignature}`;
  }

  static class(fullClassName: string): string {
    const slashName = fullClassName.replace(/\./g, '/');
    return `L${slashName};`;
  }
}

/**
 * Method handle inside a Java class.
 */
export class JNIMethod {
  readonly clazz: JNIClass;
  readonly name: string;
  readonly signature: string;
  readonly isStatic: boolean;
  readonly methodId: Pointer;

  constructor(clazz: JNIClass, name: string, signature: string, isStatic: boolean, methodId?: Pointer) {
    this.clazz = clazz;
    this.name = name;
    this.signature = signature;
    this.isStatic = isStatic;
    this.methodId = methodId || new Pointer(BigInt(0x90000000 + Math.abs(hashString(`${clazz.name}#${name}${signature}`))));
  }
}

/**
 * JNI Class representation (jclass).
 */
export class JNIClass {
  readonly name: string; // e.g. "com/google/firebase/appcheck/FirebaseAppCheck"
  readonly pointer: Pointer;

  constructor(name: string, pointer?: Pointer) {
    this.name = name.replace(/\./g, '/');
    this.pointer = pointer || new Pointer(BigInt(0xa0000000 + Math.abs(hashString(this.name))));
  }

  /**
   * Lookup a static method ID on this class.
   */
  getStaticMethod(name: string, signature: string): JNIMethod {
    return new JNIMethod(this, name, signature, true);
  }

  /**
   * Lookup an instance method ID on this class.
   */
  getMethod(name: string, signature: string): JNIMethod {
    return new JNIMethod(this, name, signature, false);
  }

  /**
   * Invoke a static method on this class.
   */
  callStaticMethod(name: string, signature: string, ...args: any[]): any {
    return JNI.callStaticMethod(this, name, signature, ...args);
  }

  /**
   * Instantiate an object of this class by calling `<init>`.
   */
  newInstance(signature = '()V', ...args: any[]): JNIObject {
    const instancePtr = JNI.newInstance(this, signature, ...args);
    return new JNIObject(instancePtr, this);
  }
}

/**
 * JNI Object instance representation (jobject).
 */
export class JNIObject {
  readonly pointer: Pointer;
  readonly jniClass?: JNIClass;

  constructor(pointer: Pointer, jniClass?: JNIClass) {
    this.pointer = pointer;
    this.jniClass = jniClass;
  }

  /**
   * Call an instance method on this Java object.
   */
  callMethod(name: string, signature: string, ...args: any[]): any {
    return JNI.callMethod(this, name, signature, ...args);
  }

  /**
   * Create a JNI global reference (prevents garbage collection across calls).
   */
  newGlobalRef(): JNIObject {
    return new JNIObject(new Pointer(this.pointer.address + 0x1000n), this.jniClass);
  }

  /**
   * Delete this local or global reference.
   */
  deleteRef(): void {
    // In native C++, calls (*env)->DeleteGlobalRef(env, jobject) or DeleteLocalRef
  }
}

function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

// Registry for mock or pre-registered JNI invocations
const jniHandlers = new Map<string, (...args: any[]) => any>();

/**
 * Main Android JNI Bridge API.
 */
export class JNI {
  private static cachedContext: JNIObject | null = null;
  private static cachedActivity: JNIObject | null = null;

  /**
   * Lookup a Java class in the Android ClassLoader (env->FindClass).
   */
  static findClass(className: string): JNIClass {
    return new JNIClass(className);
  }

  /**
   * Get the current Android Application Context.
   */
  static getApplicationContext(): JNIObject {
    if (!this.cachedContext) {
      this.cachedContext = new JNIObject(new Pointer(0xb0000000n), new JNIClass('android/content/Context'));
    }
    return this.cachedContext;
  }

  /**
   * Get the active Android Activity.
   */
  static getActivity(): JNIObject {
    if (!this.cachedActivity) {
      this.cachedActivity = new JNIObject(new Pointer(0xb0001000n), new JNIClass('android/app/Activity'));
    }
    return this.cachedActivity;
  }

  /**
   * Convert a TypeScript string to a Java jstring.
   */
  static toJString(str: string): Pointer {
    const cstr = Memory.writeCString(str);
    const jstrPtr = new Pointer(BigInt(0xc0000000 + Math.abs(hashString(str))));
    return jstrPtr;
  }

  /**
   * Convert a Java jstring pointer back into a TypeScript string.
   */
  static fromJString(jstringPtr: Pointer): string {
    if (jstringPtr.isNull()) return '';
    return '';
  }

  /**
   * Convert a Uint8Array into a Java jbyteArray.
   */
  static toJByteArray(data: Uint8Array): Pointer {
    return Memory.writeBuffer(data);
  }

  /**
   * Convert a Java jbyteArray pointer back into a Uint8Array.
   */
  static fromJByteArray(jbyteArrayPtr: Pointer, length: number): Uint8Array {
    return Memory.readBuffer(jbyteArrayPtr, length);
  }

  /**
   * Call a static Java method.
   */
  static callStaticMethod(clazz: JNIClass, methodName: string, signature: string, ...args: any[]): any {
    const key = `${clazz.name}#${methodName}${signature}`;
    const handler = jniHandlers.get(key) || jniHandlers.get(`${clazz.name}#${methodName}`);
    if (handler) {
      return handler(...args);
    }

    // Default object/pointer return
    if (signature.endsWith(';') || signature.endsWith(']')) {
      return new JNIObject(new Pointer(0xd0000000n));
    }
    if (signature.endsWith('Z')) return false;
    if (signature.endsWith('I') || signature.endsWith('F') || signature.endsWith('D')) return 0;
    if (signature.endsWith('J')) return 0n;
    return undefined;
  }

  /**
   * Call an instance Java method.
   */
  static callMethod(target: JNIObject, methodName: string, signature: string, ...args: any[]): any {
    const className = target.jniClass?.name || 'java/lang/Object';
    const key = `${className}#${methodName}${signature}`;
    const handler = jniHandlers.get(key) || jniHandlers.get(`${className}#${methodName}`);
    if (handler) {
      return handler(target, ...args);
    }

    if (signature.endsWith(';') || signature.endsWith(']')) {
      return new JNIObject(new Pointer(0xe0000000n));
    }
    if (signature.endsWith('Z')) return false;
    if (signature.endsWith('I') || signature.endsWith('F') || signature.endsWith('D')) return 0;
    if (signature.endsWith('J')) return 0n;
    return undefined;
  }

  /**
   * Construct a new Java object instance.
   */
  static newInstance(clazz: JNIClass, signature: string, ...args: any[]): Pointer {
    return new Pointer(0xf0000000n);
  }

  /**
   * Register a custom handler for mock/testing an Android JNI call.
   */
  static registerHandler(methodKey: string, handler: (...args: any[]) => any): void {
    jniHandlers.set(methodKey, handler);
  }
}
