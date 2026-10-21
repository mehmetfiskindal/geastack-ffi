/**
 * Real native memory for Node hosts.
 *
 * Unlike `Memory` (a deterministic simulated heap used by previews and tests),
 * these helpers allocate with koffi and return registered native pointers that
 * can be passed to `Library` calls.
 */
import { Pointer } from './memory.js';
import { StructDefinition } from './struct.js';
export declare class NativeMemory {
    /** Allocate a zeroed native buffer and return a registered pointer. */
    static alloc(size: number): Pointer;
    /** Free a buffer allocated by alloc(). */
    static free(pointer: Pointer): void;
    static writeBuffer(pointer: Pointer, data: Uint8Array): void;
    static readBuffer(pointer: Pointer, length: number): Uint8Array;
    static writeCString(value: string): Pointer;
    static readCString(pointer: Pointer, maxLength?: number): string;
    static readInt32(pointer: Pointer): number;
    static writeInt32(pointer: Pointer, value: number): void;
    static readUint32(pointer: Pointer): number;
    static writeUint32(pointer: Pointer, value: number): void;
    static readDouble(pointer: Pointer): number;
    static writeDouble(pointer: Pointer, value: number): void;
    static allocStruct(definition: StructDefinition, initial?: Record<string, unknown>): NativeStructInstance;
    static readStruct(definition: StructDefinition, pointer: Pointer): NativeStructInstance;
}
/** A struct view over real native memory. */
export declare class NativeStructInstance {
    readonly definition: StructDefinition;
    readonly pointer: Pointer;
    private owned;
    constructor(definition: StructDefinition, pointer: Pointer, owned?: boolean);
    get(fieldName: string): unknown;
    set(fieldName: string, value: unknown): void;
    toObject(): Record<string, unknown>;
    assign(values: Record<string, unknown>): void;
    free(): void;
}
//# sourceMappingURL=native-memory.d.ts.map