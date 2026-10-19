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
    static VOID = 'V';
    static BOOLEAN = 'Z';
    static BYTE = 'B';
    static CHAR = 'C';
    static SHORT = 'S';
    static INT = 'I';
    static LONG = 'J';
    static FLOAT = 'F';
    static DOUBLE = 'D';
    static STRING = 'Ljava/lang/String;';
    static OBJECT = 'Ljava/lang/Object;';
    static CONTEXT = 'Landroid/content/Context;';
    static ACTIVITY = 'Landroid/app/Activity;';
    /**
     * Helper to construct a standard JNI method signature string.
     * e.g. `(Ljava/lang/String;I)Z`
     */
    static method(returnType, ...argTypes) {
        return `(${argTypes.join('')})${returnType}`;
    }
    static array(elementSignature) {
        return `[${elementSignature}`;
    }
    static class(fullClassName) {
        const slashName = fullClassName.replace(/\./g, '/');
        return `L${slashName};`;
    }
}
/**
 * Method handle inside a Java class.
 */
export class JNIMethod {
    clazz;
    name;
    signature;
    isStatic;
    methodId;
    constructor(clazz, name, signature, isStatic, methodId) {
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
    name; // e.g. "com/google/firebase/appcheck/FirebaseAppCheck"
    pointer;
    constructor(name, pointer) {
        this.name = name.replace(/\./g, '/');
        this.pointer = pointer || new Pointer(BigInt(0xa0000000 + Math.abs(hashString(this.name))));
    }
    /**
     * Lookup a static method ID on this class.
     */
    getStaticMethod(name, signature) {
        return new JNIMethod(this, name, signature, true);
    }
    /**
     * Lookup an instance method ID on this class.
     */
    getMethod(name, signature) {
        return new JNIMethod(this, name, signature, false);
    }
    /**
     * Invoke a static method on this class.
     */
    callStaticMethod(name, signature, ...args) {
        return JNI.callStaticMethod(this, name, signature, ...args);
    }
    /**
     * Instantiate an object of this class by calling `<init>`.
     */
    newInstance(signature = '()V', ...args) {
        const instancePtr = JNI.newInstance(this, signature, ...args);
        return new JNIObject(instancePtr, this);
    }
}
/**
 * JNI Object instance representation (jobject).
 */
export class JNIObject {
    pointer;
    jniClass;
    constructor(pointer, jniClass) {
        this.pointer = pointer;
        this.jniClass = jniClass;
    }
    /**
     * Call an instance method on this Java object.
     */
    callMethod(name, signature, ...args) {
        return JNI.callMethod(this, name, signature, ...args);
    }
    /**
     * Create a JNI global reference (prevents garbage collection across calls).
     */
    newGlobalRef() {
        return new JNIObject(new Pointer(this.pointer.address + 0x1000n), this.jniClass);
    }
    /**
     * Delete this local or global reference.
     */
    deleteRef() {
        // In native C++, calls (*env)->DeleteGlobalRef(env, jobject) or DeleteLocalRef
    }
}
function hashString(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash) + str.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
}
// Registry for mock or pre-registered JNI invocations
const jniHandlers = new Map();
/**
 * Main Android JNI Bridge API.
 */
export class JNI {
    static cachedContext = null;
    static cachedActivity = null;
    /**
     * Lookup a Java class in the Android ClassLoader (env->FindClass).
     */
    static findClass(className) {
        return new JNIClass(className);
    }
    /**
     * Get the current Android Application Context.
     */
    static getApplicationContext() {
        if (!this.cachedContext) {
            this.cachedContext = new JNIObject(new Pointer(0xb0000000n), new JNIClass('android/content/Context'));
        }
        return this.cachedContext;
    }
    /**
     * Get the active Android Activity.
     */
    static getActivity() {
        if (!this.cachedActivity) {
            this.cachedActivity = new JNIObject(new Pointer(0xb0001000n), new JNIClass('android/app/Activity'));
        }
        return this.cachedActivity;
    }
    /**
     * Convert a TypeScript string to a Java jstring.
     */
    static toJString(str) {
        const cstr = Memory.writeCString(str);
        const jstrPtr = new Pointer(BigInt(0xc0000000 + Math.abs(hashString(str))));
        return jstrPtr;
    }
    /**
     * Convert a Java jstring pointer back into a TypeScript string.
     */
    static fromJString(jstringPtr) {
        if (jstringPtr.isNull())
            return '';
        return '';
    }
    /**
     * Convert a Uint8Array into a Java jbyteArray.
     */
    static toJByteArray(data) {
        return Memory.writeBuffer(data);
    }
    /**
     * Convert a Java jbyteArray pointer back into a Uint8Array.
     */
    static fromJByteArray(jbyteArrayPtr, length) {
        return Memory.readBuffer(jbyteArrayPtr, length);
    }
    /**
     * Call a static Java method.
     */
    static callStaticMethod(clazz, methodName, signature, ...args) {
        const key = `${clazz.name}#${methodName}${signature}`;
        const handler = jniHandlers.get(key) || jniHandlers.get(`${clazz.name}#${methodName}`);
        if (handler) {
            return handler(...args);
        }
        // Default object/pointer return
        if (signature.endsWith(';') || signature.endsWith(']')) {
            return new JNIObject(new Pointer(0xd0000000n));
        }
        if (signature.endsWith('Z'))
            return false;
        if (signature.endsWith('I') || signature.endsWith('F') || signature.endsWith('D'))
            return 0;
        if (signature.endsWith('J'))
            return 0n;
        return undefined;
    }
    /**
     * Call an instance Java method.
     */
    static callMethod(target, methodName, signature, ...args) {
        const className = target.jniClass?.name || 'java/lang/Object';
        const key = `${className}#${methodName}${signature}`;
        const handler = jniHandlers.get(key) || jniHandlers.get(`${className}#${methodName}`);
        if (handler) {
            return handler(target, ...args);
        }
        if (signature.endsWith(';') || signature.endsWith(']')) {
            return new JNIObject(new Pointer(0xe0000000n));
        }
        if (signature.endsWith('Z'))
            return false;
        if (signature.endsWith('I') || signature.endsWith('F') || signature.endsWith('D'))
            return 0;
        if (signature.endsWith('J'))
            return 0n;
        return undefined;
    }
    /**
     * Construct a new Java object instance.
     */
    static newInstance(clazz, signature, ...args) {
        return new Pointer(0xf0000000n);
    }
    /**
     * Register a custom handler for mock/testing an Android JNI call.
     */
    static registerHandler(methodKey, handler) {
        jniHandlers.set(methodKey, handler);
    }
}
//# sourceMappingURL=index.js.map