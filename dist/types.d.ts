/**
 * @geastack/ffi - Core Type System
 * Foreign Function Interface type definitions and mappings.
 */
/**
 * Primitive FFI Data Types supported across native architectures.
 */
export type PrimitiveType = 'void' | 'bool' | 'int8' | 'uint8' | 'int16' | 'uint16' | 'int32' | 'uint32' | 'int64' | 'uint64' | 'float' | 'double' | 'pointer' | 'string' | 'buffer';
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
export type FFIType = PrimitiveType | StructDefinition<any> | CallbackDefinition<any, any>;
/**
 * Function signature descriptor for native FFI invocations.
 */
export interface FunctionDescriptor<TReturn extends FFIType = FFIType, TArgs extends readonly FFIType[] = readonly FFIType[]> {
    readonly args: TArgs;
    readonly returns: TReturn;
    /**
     * Symbol name in the native binary. Defaults to the property name if omitted.
     */
    readonly symbol?: string;
    /**
     * If true, call is executed asynchronously on a background worker thread.
     */
    readonly async?: boolean;
}
/**
 * Struct field definition.
 */
export interface StructField<T extends FFIType = FFIType> {
    readonly type: T;
    readonly offset?: number;
}
/**
 * Struct definition model.
 */
export interface StructDefinition<TFields extends Record<string, FFIType> = Record<string, FFIType>> {
    readonly __isStruct: true;
    readonly name: string;
    readonly fields: {
        [K in keyof TFields]: StructField<TFields[K]>;
    };
    readonly size: number;
    readonly alignment: number;
}
/**
 * Callback function definition.
 */
export interface CallbackDefinition<TReturn extends FFIType = FFIType, TArgs extends readonly FFIType[] = readonly FFIType[]> {
    readonly __isCallback: true;
    readonly args: TArgs;
    readonly returns: TReturn;
}
/**
 * Mapping from FFI primitive names to TypeScript runtime types.
 */
export type PrimitiveToTypeScript<T extends PrimitiveType> = T extends 'void' ? void : T extends 'bool' ? boolean : T extends 'int8' | 'uint8' | 'int16' | 'uint16' | 'int32' | 'uint32' | 'float' | 'double' ? number : T extends 'int64' | 'uint64' ? bigint : T extends 'string' ? string : T extends 'pointer' ? bigint | null : T extends 'buffer' ? Uint8Array : never;
/**
 * Maps an FFIType to its corresponding TypeScript type.
 */
export type FFITypeToTypeScript<T extends FFIType> = T extends PrimitiveType ? PrimitiveToTypeScript<T> : T extends StructDefinition<infer TFields> ? {
    [K in keyof TFields]: FFITypeToTypeScript<TFields[K]>;
} : T extends CallbackDefinition<infer TRet, infer TArgs> ? (...args: {
    [K in keyof TArgs]: FFITypeToTypeScript<TArgs[K] & FFIType>;
}) => FFITypeToTypeScript<TRet> : any;
/**
 * Target Platform Enum for FFI routing.
 */
export type TargetPlatform = 'macos' | 'ios' | 'android' | 'linux' | 'windows' | 'esp32' | 'rp2350' | 'web';
//# sourceMappingURL=types.d.ts.map