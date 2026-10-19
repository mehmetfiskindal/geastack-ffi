/**
 * @geastack/ffi - C Struct Layout and Serialization
 * Computes standard C ABI alignment, padding, and field offsets.
 */
import { FFIType, StructDefinition, FFITypeToTypeScript } from './types.js';
import { Pointer } from './memory.js';
export interface StructLayoutField {
    readonly name: string;
    readonly type: FFIType;
    readonly size: number;
    readonly alignment: number;
    readonly offset: number;
}
/**
 * Resolves the byte size and alignment requirements for an FFI type.
 */
export declare function getTypeInfo(type: FFIType): {
    size: number;
    alignment: number;
};
/**
 * Computes C-compatible ABI struct layout with alignment padding.
 */
export declare function computeStructLayout<TFields extends Record<string, FFIType>>(fields: TFields): {
    layout: Record<keyof TFields, StructLayoutField>;
    totalSize: number;
    maxAlignment: number;
};
/**
 * High-level typed struct instance wrapping native memory.
 */
export declare class StructInstance<TFields extends Record<string, FFIType>> {
    readonly definition: StructDefinition<TFields>;
    readonly pointer: Pointer;
    constructor(definition: StructDefinition<TFields>, pointer: Pointer);
    /**
     * Read a field value from struct memory.
     */
    get<K extends keyof TFields>(fieldName: K): FFITypeToTypeScript<TFields[K]>;
    /**
     * Write a field value to struct memory.
     */
    set<K extends keyof TFields>(fieldName: K, value: FFITypeToTypeScript<TFields[K]>): void;
    /**
     * Unpack the entire struct into a plain TypeScript JavaScript object.
     */
    toObject(): {
        [K in keyof TFields]: FFITypeToTypeScript<TFields[K]>;
    };
    /**
     * Populate struct fields from a plain JavaScript object.
     */
    assign(values: Partial<{
        [K in keyof TFields]: FFITypeToTypeScript<TFields[K]>;
    }>): void;
    /**
     * Free the struct's allocated memory.
     */
    free(): void;
}
/**
 * Creates a strongly typed C Struct Definition.
 *
 * @example
 * ```ts
 * const Point = defineStruct('Point', {
 *   x: 'int32',
 *   y: 'int32',
 *   label: 'string',
 * });
 *
 * const pt = Point.alloc({ x: 10, y: 20, label: 'Origin' });
 * console.log(pt.get('x'), pt.get('label'));
 * pt.free();
 * ```
 */
export declare function defineStruct<TFields extends Record<string, FFIType>>(name: string, fields: TFields): StructDefinition<TFields> & {
    alloc(initial?: Partial<{
        [K in keyof TFields]: FFITypeToTypeScript<TFields[K]>;
    }>): StructInstance<TFields>;
    fromPointer(pointer: Pointer): StructInstance<TFields>;
};
//# sourceMappingURL=struct.d.ts.map