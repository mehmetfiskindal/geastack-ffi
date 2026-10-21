/**
 * @geastack/ffi - Core Type System
 * Foreign Function Interface type definitions and mappings.
 */
import type { StructDefinition } from './struct.js';
/**
 * Primitive FFI Data Types supported across native architectures.
 */
export type PrimitiveType = 'void' | 'bool' | 'int8' | 'uint8' | 'int16' | 'uint16' | 'int32' | 'uint32' | 'int64' | 'uint64' | 'float' | 'double' | 'pointer' | 'string' | 'wstring' | 'buffer';
/**
 * Native calling convention (ABI) for function invocations.
 */
export type CallingConvention = 'cdecl' | 'stdcall' | 'win64' | 'sysv64' | 'fastcall';
/**
 * Size in bytes and alignment for each primitive type on 32-bit and 64-bit systems.
 */
export interface TypeInfo {
    readonly name: PrimitiveType;
    readonly size: number;
    readonly alignment: number;
}
export declare const PRIMITIVE_SIZES: Record<PrimitiveType, number>;
export declare const PRIMITIVE_ALIGNMENTS: Record<PrimitiveType, number>;
/**
 * Composite or structured FFI type descriptor.
 */
export type FFIType = PrimitiveType | StructDefinition | CallbackDefinition;
/**
 * Function signature descriptor for native FFI invocations.
 */
export interface FunctionDescriptor {
    readonly args: readonly FFIType[];
    readonly returns: FFIType;
    /**
     * Symbol name in the native binary. Defaults to the property name if omitted.
     */
    readonly symbol?: string;
    /**
     * If true, call is executed asynchronously on a background worker thread.
     */
    readonly async?: boolean;
    /**
     * Optional calling convention override (e.g., 'stdcall' for 32-bit Win32 APIs).
     */
    readonly abi?: CallingConvention;
}
/**
 * Struct field definition.
 */
export interface StructField {
    readonly type: FFIType;
    readonly offset?: number;
}
export type { StructDefinition };
/**
 * Callback function definition.
 */
export interface CallbackDefinition {
    readonly __isCallback: true;
    readonly args: readonly FFIType[];
    readonly returns: FFIType;
}
/**
 * Define a C function-pointer callback type for the host backend.
 * Callbacks are transient: they are valid while the native call is running.
 */
export declare function defineCallback(returns: FFIType, args?: readonly FFIType[]): CallbackDefinition;
/**
 * Mapping from FFI primitive names to TypeScript runtime types.
 */
export type PrimitiveToTypeScript<T extends PrimitiveType> = T extends 'void' ? void : T extends 'bool' ? boolean : T extends 'int8' | 'uint8' | 'int16' | 'uint16' | 'int32' | 'uint32' | 'float' | 'double' ? number : T extends 'int64' | 'uint64' ? bigint : T extends 'string' | 'wstring' ? string : T extends 'pointer' ? bigint | null : T extends 'buffer' ? Uint8Array : never;
/**
 * Maps an FFIType to its corresponding TypeScript type.
 */
export type FFITypeToTypeScript<T extends FFIType> = T extends PrimitiveType ? PrimitiveToTypeScript<T> : T extends StructDefinition ? Record<string, any> : any;
/**
 * Target Platform Enum for FFI routing.
 */
export type TargetPlatform = 'macos' | 'ios' | 'android' | 'linux' | 'sailfishos' | 'windows' | 'esp32' | 'rp2350' | 'web';
//# sourceMappingURL=types.d.ts.map