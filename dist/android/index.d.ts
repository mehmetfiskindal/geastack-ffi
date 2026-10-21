/**
 * @geastack/ffi - Android JNI (Java Native Interface) Bridge
 *
 * This TypeScript module is an in-process simulation used by tests and
 * previews. Real JNI calls on Android use the native bridge in
 * `src/native/gea_ffi_android.cpp` (`gea_ffi_android_*`), which is verified
 * against a host JVM and cross-compiled with the NDK.
 */
import { Pointer } from '../memory.js';
/**
 * JNI Type Signature helpers.
 */
export declare class JNISignature {
    static readonly VOID = "V";
    static readonly BOOLEAN = "Z";
    static readonly BYTE = "B";
    static readonly CHAR = "C";
    static readonly SHORT = "S";
    static readonly INT = "I";
    static readonly LONG = "J";
    static readonly FLOAT = "F";
    static readonly DOUBLE = "D";
    static readonly STRING = "Ljava/lang/String;";
    static readonly OBJECT = "Ljava/lang/Object;";
    static readonly CONTEXT = "Landroid/content/Context;";
    static readonly ACTIVITY = "Landroid/app/Activity;";
    /**
     * Helper to construct a standard JNI method signature string.
     * e.g. `(Ljava/lang/String;I)Z`
     */
    static method(returnType: string, ...argTypes: string[]): string;
    static array(elementSignature: string): string;
    static class(fullClassName: string): string;
}
/**
 * Method handle inside a Java class.
 */
export declare class JNIMethod {
    readonly clazz: JNIClass;
    readonly name: string;
    readonly signature: string;
    readonly isStatic: boolean;
    readonly methodId: Pointer;
    constructor(clazz: JNIClass, name: string, signature: string, isStatic: boolean, methodId?: Pointer);
}
/**
 * JNI Class representation (jclass).
 */
export declare class JNIClass {
    readonly name: string;
    readonly pointer: Pointer;
    constructor(name: string, pointer?: Pointer);
    /**
     * Lookup a static method ID on this class.
     */
    getStaticMethod(name: string, signature: string): JNIMethod;
    /**
     * Lookup an instance method ID on this class.
     */
    getMethod(name: string, signature: string): JNIMethod;
    /**
     * Invoke a static method on this class.
     */
    callStaticMethod(name: string, signature: string, ...args: any[]): any;
    /**
     * Instantiate an object of this class by calling `<init>`.
     */
    newInstance(signature?: string, ...args: any[]): JNIObject;
}
/**
 * JNI Object instance representation (jobject).
 */
export declare class JNIObject {
    readonly pointer: Pointer;
    readonly jniClass?: JNIClass;
    constructor(pointer: Pointer, jniClass?: JNIClass);
    /**
     * Call an instance method on this Java object.
     */
    callMethod(name: string, signature: string, ...args: any[]): any;
    /**
     * Create a JNI global reference (prevents garbage collection across calls).
     */
    newGlobalRef(): JNIObject;
    /**
     * Delete this local or global reference.
     */
    deleteRef(): void;
}
/**
 * Main Android JNI Bridge API.
 */
export declare class JNI {
    private static cachedContext;
    private static cachedActivity;
    /**
     * Lookup a Java class in the Android ClassLoader (env->FindClass).
     */
    static findClass(className: string): JNIClass;
    /**
     * Get the current Android Application Context.
     */
    static getApplicationContext(): JNIObject;
    /**
     * Get the active Android Activity.
     */
    static getActivity(): JNIObject;
    /**
     * Convert a TypeScript string to a Java jstring.
     */
    static toJString(str: string): Pointer;
    /**
     * Convert a Java jstring pointer back into a TypeScript string.
     */
    static fromJString(jstringPtr: Pointer): string;
    /**
     * Convert a Uint8Array into a Java jbyteArray.
     */
    static toJByteArray(data: Uint8Array): Pointer;
    /**
     * Convert a Java jbyteArray pointer back into a Uint8Array.
     */
    static fromJByteArray(jbyteArrayPtr: Pointer, length: number): Uint8Array;
    /**
     * Call a static Java method.
     */
    static callStaticMethod(clazz: JNIClass, methodName: string, signature: string, ...args: any[]): any;
    /**
     * Call an instance Java method.
     */
    static callMethod(target: JNIObject, methodName: string, signature: string, ...args: any[]): any;
    /**
     * Construct a new Java object instance.
     */
    static newInstance(clazz: JNIClass, signature: string, ...args: any[]): Pointer;
    /**
     * Register a custom handler for mock/testing an Android JNI call.
     */
    static registerHandler(methodKey: string, handler: (...args: any[]) => any): void;
}
//# sourceMappingURL=index.d.ts.map