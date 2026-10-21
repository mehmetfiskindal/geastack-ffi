/**
 * Tracks pointers that came from a real native runtime.
 *
 * `Memory` allocates from a simulated heap. Those addresses must never be
 * handed to a native function, so every native call checks this registry first.
 */
import { Pointer } from './memory.js';
/**
 * Wrap a raw address returned by a native call and mark it as native.
 * A zero address maps to the shared NULL pointer.
 */
export declare function adoptNativePointer(address: bigint | number): Pointer;
/**
 * Mark an existing pointer as native. Returns the same instance.
 */
export declare function markNativePointer(pointer: Pointer): Pointer;
/**
 * True when the pointer may be passed to a native function (including NULL).
 */
export declare function isNativePointer(pointer: Pointer): boolean;
/**
 * Convert a pointer to the address a native call expects.
 * Throws for simulated-heap pointers so a bad address cannot reach native code.
 */
export declare function requireNativeAddress(pointer: Pointer, label?: string): bigint | null;
//# sourceMappingURL=native-pointers.d.ts.map