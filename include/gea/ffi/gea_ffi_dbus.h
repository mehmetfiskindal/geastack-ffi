// SPDX-License-Identifier: Apache-2.0
#pragma once

#include "gea_ffi_types.h"

#ifdef __cplusplus
extern "C" {
#endif

/*
 * Minimal generic D-Bus client for Linux and Sailfish OS.
 *
 * The bridge supports the scalar types used by MCE, NGFD, UPower, BlueZ,
 * NetworkManager, and the Freedesktop portals: strings, object paths, booleans,
 * int32/uint32, int64/uint64, and doubles. Arrays, dictionaries, and variants
 * are rejected with an error instead of being guessed at.
 *
 * `gea_ffi_dbus_call` writes up to `result_capacity` reply values into
 * `results` and stores the actual count in `*result_count`. Strings in results
 * are allocated with malloc and must be released with gea_ffi_dbus_free().
 */

typedef enum GeaDbusKind {
    GEA_DBUS_INVALID = 0,
    GEA_DBUS_STRING,
    GEA_DBUS_OBJECT_PATH,
    GEA_DBUS_BOOLEAN,
    GEA_DBUS_INT32,
    GEA_DBUS_UINT32,
    GEA_DBUS_INT64,
    GEA_DBUS_UINT64,
    GEA_DBUS_DOUBLE,
    GEA_DBUS_EMPTY_ARRAY
} GeaDbusKind;

typedef struct GeaDbusValue {
    int32_t kind;
    union {
        const char* str;
        uint8_t b;
        int32_t i32;
        uint32_t u32;
        int64_t i64;
        uint64_t u64;
        double d;
    } as;
} GeaDbusValue;

/** Bus types match libdbus: 0 = session, 1 = system. */
int32_t gea_ffi_dbus_connect(int32_t bus_type, void** connection);
void    gea_ffi_dbus_disconnect(void* connection);

/** Unique bus name of the connection, or an empty string. */
const char* gea_ffi_dbus_unique_name(void* connection);

int32_t gea_ffi_dbus_call(void* connection,
                          const char* service,
                          const char* object_path,
                          const char* interface_name,
                          const char* method,
                          const GeaDbusValue* args, int32_t argc,
                          GeaDbusValue* results, int32_t result_capacity,
                          int32_t* result_count);

int32_t gea_ffi_dbus_call_timeout(void* connection,
                                  const char* service,
                                  const char* object_path,
                                  const char* interface_name,
                                  const char* method,
                                  const GeaDbusValue* args, int32_t argc,
                                  GeaDbusValue* results, int32_t result_capacity,
                                  int32_t* result_count,
                                  int32_t timeout_ms);

/**
 * Set a property through org.freedesktop.DBus.Properties.Set.
 * `value` is wrapped in the matching variant signature.
 */
int32_t gea_ffi_dbus_set_property(void* connection,
                                  const char* service,
                                  const char* object_path,
                                  const char* interface_name,
                                  const char* property_name,
                                  const GeaDbusValue* value);

/** Add or remove a match rule for incoming signals. */
int32_t gea_ffi_dbus_add_match(void* connection, const char* rule);
int32_t gea_ffi_dbus_remove_match(void* connection, const char* rule);

/**
 * Wait for the next signal matching the installed rules.
 * Returns 1 with interface/member/path and scalar arguments filled, 0 on timeout,
 * or a negative error code. Returned strings are copied into the caller buffers.
 */
int32_t gea_ffi_dbus_next_signal(void* connection, int32_t timeout_ms,
                                 char* interface_out, int32_t interface_capacity,
                                 char* member_out, int32_t member_capacity,
                                 char* path_out, int32_t path_capacity,
                                 GeaDbusValue* values, int32_t value_capacity,
                                 int32_t* value_count);

/** Last error for the calling thread. Never null; empty when there is no error. */
const char* gea_ffi_dbus_last_error(void);
void        gea_ffi_dbus_clear_error(void);
void        gea_ffi_dbus_free(void* ptr);

#ifdef __cplusplus
}
#endif
