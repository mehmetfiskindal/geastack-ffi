// SPDX-License-Identifier: Apache-2.0
#pragma once

#include "gea_ffi_types.h"

#ifdef __cplusplus
extern "C" {
#endif

/*
 * Minimal libdconf bridge for Sailfish OS and Linux.
 *
 * Supports the scalar value types used by Silica/theme settings: boolean,
 * int32, uint32, double, and string. Arrays, dictionaries, and variants are
 * rejected. String results are allocated with malloc and must be released with
 * gea_ffi_dconf_free().
 */

typedef enum GeaDconfKind {
    GEA_DCONF_BOOL = 0,
    GEA_DCONF_INT32,
    GEA_DCONF_UINT32,
    GEA_DCONF_DOUBLE,
    GEA_DCONF_STRING
} GeaDconfKind;

typedef struct GeaDconfValue {
    int32_t kind;
    union {
        uint8_t b;
        int32_t i32;
        uint32_t u32;
        double d;
        const char* str;
    } as;
} GeaDconfValue;

/** True when this build found libdconf. */
bool gea_ffi_dconf_available(void);

/**
 * Read a key. Returns 0 on success, 1 when the key does not exist, and a
 * negative error code otherwise.
 */
int32_t gea_ffi_dconf_read(const char* key, GeaDconfValue* result);

/** Write a key and flush the change. Returns 0 on success. */
int32_t gea_ffi_dconf_write(const char* key, const GeaDconfValue* value);

/** Flush any pending dconf operations. */
int32_t gea_ffi_dconf_sync(void);

/** Last error for the calling thread. Never null. */
const char* gea_ffi_dconf_last_error(void);
void        gea_ffi_dconf_free(void* ptr);

#ifdef __cplusplus
}
#endif
