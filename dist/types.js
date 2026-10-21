// SPDX-License-Identifier: Apache-2.0
/**
 * @geastack/ffi - Core Type System
 * Foreign Function Interface type definitions and mappings.
 */
export const PRIMITIVE_SIZES = {
    void: 0,
    bool: 1,
    int8: 1,
    uint8: 1,
    int16: 2,
    uint16: 2,
    int32: 4,
    uint32: 4,
    int64: 8,
    uint64: 8,
    float: 4,
    double: 8,
    pointer: 8, // Standard 64-bit default, adjusted for 32-bit targets
    string: 8,
    wstring: 8,
    buffer: 8,
};
export const PRIMITIVE_ALIGNMENTS = {
    void: 1,
    bool: 1,
    int8: 1,
    uint8: 1,
    int16: 2,
    uint16: 2,
    int32: 4,
    uint32: 4,
    int64: 8,
    uint64: 8,
    float: 4,
    double: 8,
    pointer: 8,
    string: 8,
    wstring: 8,
    buffer: 8,
};
/**
 * Define a C function-pointer callback type for the host backend.
 * Callbacks are transient: they are valid while the native call is running.
 */
export function defineCallback(returns, args = []) {
    return { __isCallback: true, args, returns };
}
//# sourceMappingURL=types.js.map