/**
 * @geastack/ffi - Memory and Pointer Management
 * Safe low-level buffer, pointer abstraction, and C-string utilities.
 */
import { PrimitiveType } from './types.js';
/**
 * Native Pointer representation.
 * Supports both 32-bit (embedded/microcontrollers) and 64-bit platforms.
 */
export declare class Pointer {
    readonly address: bigint;
    constructor(address: bigint | number | string | Pointer);
    /**
     * Represents the NULL pointer (address 0x0).
     */
    static readonly NULL: Pointer;
    /**
     * Check if this pointer is NULL (0x0).
     */
    isNull(): boolean;
    /**
     * Create a new pointer offset by a number of bytes.
     */
    offset(bytes: number | bigint): Pointer;
    /**
     * Returns hexadecimal representation of pointer address.
     */
    toHex(): string;
    toString(): string;
    valueOf(): bigint;
}
/**
 * Safe Low-level Memory Operations.
 */
export declare class Memory {
    /**
     * Allocate `size` bytes of uninitialized memory.
     */
    static alloc(size: number): Pointer;
    /**
     * Free previously allocated memory.
     */
    static free(pointer: Pointer): void;
    /**
     * Allocate memory and copy a UTF-8 string with a null-terminator (\0).
     */
    static writeCString(str: string): Pointer;
    /**
     * Read a null-terminated UTF-8 C-string from a memory address.
     */
    static readCString(pointer: Pointer, maxLength?: number): string;
    /**
     * Copy a raw Uint8Array buffer into freshly allocated native memory.
     */
    static writeBuffer(data: Uint8Array): Pointer;
    /**
     * Read a slice of bytes from a pointer into a Uint8Array.
     */
    static readBuffer(pointer: Pointer, length: number): Uint8Array;
    static readBool(pointer: Pointer): boolean;
    static readInt8(pointer: Pointer): number;
    static readUint8(pointer: Pointer): number;
    static readInt16(pointer: Pointer, littleEndian?: boolean): number;
    static readUint16(pointer: Pointer, littleEndian?: boolean): number;
    static readInt32(pointer: Pointer, littleEndian?: boolean): number;
    static readUint32(pointer: Pointer, littleEndian?: boolean): number;
    static readInt64(pointer: Pointer, littleEndian?: boolean): bigint;
    static readUint64(pointer: Pointer, littleEndian?: boolean): bigint;
    static readFloat(pointer: Pointer, littleEndian?: boolean): number;
    static readDouble(pointer: Pointer, littleEndian?: boolean): number;
    static readPointer(pointer: Pointer, littleEndian?: boolean): Pointer;
    static writeBool(pointer: Pointer, value: boolean): void;
    static writeInt8(pointer: Pointer, value: number): void;
    static writeUint8(pointer: Pointer, value: number): void;
    static writeInt16(pointer: Pointer, value: number, littleEndian?: boolean): void;
    static writeUint16(pointer: Pointer, value: number, littleEndian?: boolean): void;
    static writeInt32(pointer: Pointer, value: number, littleEndian?: boolean): void;
    static writeUint32(pointer: Pointer, value: number, littleEndian?: boolean): void;
    static writeInt64(pointer: Pointer, value: bigint, littleEndian?: boolean): void;
    static writeUint64(pointer: Pointer, value: bigint, littleEndian?: boolean): void;
    static writeFloat(pointer: Pointer, value: number, littleEndian?: boolean): void;
    static writeDouble(pointer: Pointer, value: number, littleEndian?: boolean): void;
    static writePointer(pointer: Pointer, value: Pointer, littleEndian?: boolean): void;
    /**
     * Helper to write any primitive value based on type name.
     */
    static writePrimitive(pointer: Pointer, type: PrimitiveType, value: any, littleEndian?: boolean): void;
    /**
     * Helper to read any primitive value based on type name.
     */
    static readPrimitive(pointer: Pointer, type: PrimitiveType, littleEndian?: boolean): any;
}
//# sourceMappingURL=memory.d.ts.map