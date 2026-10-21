/**
 * @geastack/ffi - C/C++, Objective-C++, and JNI Code Generator
 * Generates native platform headers and glue code directly from TypeScript FFI definitions.
 */
import { FFIType, StructDefinition, FunctionDescriptor } from '../types.js';
export interface CodegenOptions {
    readonly moduleName: string;
    readonly structs?: Record<string, StructDefinition>;
    readonly functions?: Record<string, FunctionDescriptor>;
    readonly headerGuard?: string;
}
export declare function toCType(type: FFIType): string;
/**
 * Generate a C/C++ header file (.h).
 */
export declare function generateCHeader(options: CodegenOptions): string;
/**
 * Generate an Objective-C++ bridge file (.mm) for iOS & macOS.
 */
export declare function generateAppleObjCpp(options: CodegenOptions, imports?: string[]): string;
export declare function generateAndroidJni(options: CodegenOptions, javaPackage: string, javaClass: string): string;
/**
 * Generate a Windows Win32 / COM C++ bridge file (.cpp).
 */
export declare function generateWindowsBridge(options: CodegenOptions, headers?: string[]): string;
/**
 * Generate a Linux POSIX / D-Bus C++ bridge file (.cpp).
 */
export declare function generateLinuxBridge(options: CodegenOptions, headers?: string[]): string;
/**
 * Generate a SailfishOS (Jolla / Mer / NemoMobile / Qt5 / D-Bus) C++ bridge file (.cpp).
 */
export declare function generateSailfishBridge(options: CodegenOptions, headers?: string[]): string;
//# sourceMappingURL=index.d.ts.map