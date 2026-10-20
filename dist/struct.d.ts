/**
 * @geastack/ffi - C Struct Layout and Serialization
 * Computes standard C ABI alignment, padding, and field offsets.
 */
import { FFIType, StructField } from './types.js';
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
export declare function computeStructLayout(fields: Record<string, FFIType>): {
    layout: Record<string, StructLayoutField>;
    totalSize: number;
    maxAlignment: number;
};
/**
 * High-level typed struct instance wrapping native memory.
 */
export declare class StructInstance {
    readonly definition: StructDefinition;
    readonly pointer: Pointer;
    constructor(definition: StructDefinition, pointer: Pointer);
    /**
     * Read a field value from struct memory.
     */
    get(fieldName: string): any;
    /**
     * Write a field value to struct memory.
     */
    set(fieldName: string, value: any): void;
    /**
     * Unpack the entire struct into a plain TypeScript JavaScript object.
     */
    toObject(): Record<string, any>;
    /**
     * Populate struct fields from a plain JavaScript object.
     */
    assign(values: Record<string, any>): void;
    /**
     * Free the struct's allocated memory.
     */
    free(): void;
}
export declare class StructDefinition {
    readonly __isStruct: true;
    readonly name: string;
    readonly fields: Record<string, StructField>;
    readonly size: number;
    readonly alignment: number;
    constructor(name: string, fields: Record<string, StructField>, size: number, alignment: number);
    alloc(initial?: Record<string, any>): StructInstance;
    fromPointer(pointer: Pointer): StructInstance;
}
export { StructDefinition as BindableStruct };
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
export declare function defineStruct(name: string, fields: Record<string, FFIType>): StructDefinition;
//# sourceMappingURL=struct.d.ts.map