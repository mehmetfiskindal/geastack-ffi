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
import { Pointer } from '../memory.js';
export type ObjCValueType = 'id' | 'class' | 'sel' | 'pointer' | 'string' | 'int' | 'uint' | 'long' | 'ulong' | 'float' | 'double' | 'bool' | 'void';
export interface ObjCSignature {
    readonly args: readonly ObjCValueType[];
    readonly returns: ObjCValueType;
}
export declare class AppleRuntime {
    readonly foundationPath = "/System/Library/Frameworks/Foundation.framework/Foundation";
    private readonly objc;
    private readonly foundation;
    private readonly getClassFn;
    private readonly getSelectorFn;
    private readonly classNameFn;
    private readonly classCache;
    private readonly selectorCache;
    private readonly sendCache;
    constructor();
    /** Raw pointer to an Objective-C class, or null when the class is not registered. */
    classNamed(name: string): bigint | null;
    /** Raw pointer to a registered selector. */
    selectorNamed(name: string): bigint;
    /** The class name of a live object, as reported by the runtime. */
    objectClassName(target: Pointer): string;
    /**
     * Send a message with an explicit C signature.
     *
     * Objective-C has no runtime type information for method arguments, so the
     * caller must describe the argument and return types exactly as the compiled
     * method expects them. Koffi then builds a `objc_msgSend` trampoline for that
     * signature.
     */
    send(target: Pointer, selector: string, signature: ObjCSignature, args: readonly unknown[]): unknown;
    private msgSend;
}
/** True when this process is running on macOS and the Objective-C runtime loaded. */
export declare function appleRuntimeAvailable(): boolean;
/**
 * Load the Objective-C runtime once. Returns null on non-Apple platforms.
 * A load failure is remembered, so a broken runtime does not retry per call.
 */
export declare function appleRuntime(): AppleRuntime | null;
//# sourceMappingURL=runtime.d.ts.map