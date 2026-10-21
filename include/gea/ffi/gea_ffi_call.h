// SPDX-License-Identifier: Apache-2.0
#pragma once

#include "gea_ffi_types.h"

#ifdef __cplusplus
extern "C" {
#endif

/*
 * Generic native call engine.
 *
 * When built with libffi, `gea_ffi_call` performs a typed call through any
 * function pointer with the platform's default C ABI. It supports the scalar
 * types and pointers/strings below. Struct-by-value and variadic calls are not
 * supported.
 *
 * The caller sets `result->kind` before the call and receives the return value
 * in the matching union field. `GEA_CALL_STRING` arguments use `as.str` and a
 * string return is exposed as a pointer in `as.ptr`/`as.str`; the caller owns
 * only the pointer, not the string storage.
 *
 * Code built without libffi still links: gea_ffi_call_available() returns false
 * and calls fail with a descriptive error.
 */

typedef enum GeaCallKind {
    GEA_CALL_VOID = 0,
    GEA_CALL_BOOL,
    GEA_CALL_INT8,
    GEA_CALL_UINT8,
    GEA_CALL_INT16,
    GEA_CALL_UINT16,
    GEA_CALL_INT32,
    GEA_CALL_UINT32,
    GEA_CALL_INT64,
    GEA_CALL_UINT64,
    GEA_CALL_FLOAT,
    GEA_CALL_DOUBLE,
    GEA_CALL_POINTER,
    GEA_CALL_STRING
} GeaCallKind;

typedef struct GeaCallValue {
    int32_t kind;
    union {
        uint8_t b;
        int8_t i8;
        uint8_t u8;
        int16_t i16;
        uint16_t u16;
        int32_t i32;
        uint32_t u32;
        int64_t i64;
        uint64_t u64;
        float f;
        double d;
        void* ptr;
        const char* str;
    } as;
} GeaCallValue;

/** True when this build includes libffi. */
bool gea_ffi_call_available(void);

/**
 * Call `function` with `argc` typed arguments.
 * Returns 0 on success, a negative error code on failure.
 */
int32_t gea_ffi_call(void* function,
                     const GeaCallValue* args,
                     int32_t argc,
                     GeaCallValue* result);

/** Last error for the calling thread. Never null. */
const char* gea_ffi_call_last_error(void);
void        gea_ffi_call_clear_error(void);

#ifdef __cplusplus
}
#endif
