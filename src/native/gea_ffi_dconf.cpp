// SPDX-License-Identifier: Apache-2.0
#if defined(__has_include)
#if __has_include(<dconf/dconf.h>)
#define GEA_FFI_DCONF_AVAILABLE 1
#endif
#endif

#if defined(GEA_FFI_HAS_DCONF) && !defined(GEA_FFI_DCONF_AVAILABLE)
#define GEA_FFI_DCONF_AVAILABLE 1
#endif

#include "gea/ffi/gea_ffi_dconf.h"

#include <cstdarg>
#include <cstdio>
#include <cstdlib>
#include <cstring>

namespace {

thread_local char g_last_error[512] = {0};

void setError(const char* format, ...) {
    va_list args;
    va_start(args, format);
    std::vsnprintf(g_last_error, sizeof(g_last_error), format, args);
    va_end(args);
}

void clearError() {
    g_last_error[0] = '\0';
}

} // namespace

#if defined(GEA_FFI_DCONF_AVAILABLE)

#include <dconf/dconf.h>
#include <glib.h>

namespace {

DConfClient* client() {
    static DConfClient* instance = dconf_client_new();
    return instance;
}

} // namespace

extern "C" {

bool gea_ffi_dconf_available(void) {
    return true;
}

int32_t gea_ffi_dconf_read(const char* key, GeaDconfValue* result) {
    clearError();
    if (!key || !result) {
        setError("DConf read received a null key or result");
        return -1;
    }
    GVariant* value = dconf_client_read(client(), key);
    if (!value) return 1;

    const char* type = g_variant_get_type_string(value);
    if (std::strcmp(type, "b") == 0) {
        result->kind = GEA_DCONF_BOOL;
        result->as.b = g_variant_get_boolean(value) ? 1 : 0;
    } else if (std::strcmp(type, "i") == 0) {
        result->kind = GEA_DCONF_INT32;
        result->as.i32 = g_variant_get_int32(value);
    } else if (std::strcmp(type, "u") == 0) {
        result->kind = GEA_DCONF_UINT32;
        result->as.u32 = g_variant_get_uint32(value);
    } else if (std::strcmp(type, "d") == 0) {
        result->kind = GEA_DCONF_DOUBLE;
        result->as.d = g_variant_get_double(value);
    } else if (std::strcmp(type, "s") == 0) {
        result->kind = GEA_DCONF_STRING;
        const char* text = g_variant_get_string(value, nullptr);
        result->as.str = ::strdup(text ? text : "");
        if (!result->as.str) {
            g_variant_unref(value);
            setError("out of memory copying a DConf string");
            return -2;
        }
    } else {
        setError("unsupported DConf value type '%s'", type);
        g_variant_unref(value);
        return -4;
    }

    g_variant_unref(value);
    return 0;
}

int32_t gea_ffi_dconf_write(const char* key, const GeaDconfValue* value) {
    clearError();
    if (!key || !value) {
        setError("DConf write received a null key or value");
        return -1;
    }

    GVariant* variant = nullptr;
    switch (value->kind) {
        case GEA_DCONF_BOOL:
            variant = g_variant_new_boolean(value->as.b ? TRUE : FALSE);
            break;
        case GEA_DCONF_INT32:
            variant = g_variant_new_int32(value->as.i32);
            break;
        case GEA_DCONF_UINT32:
            variant = g_variant_new_uint32(value->as.u32);
            break;
        case GEA_DCONF_DOUBLE:
            variant = g_variant_new_double(value->as.d);
            break;
        case GEA_DCONF_STRING:
            variant = g_variant_new_string(value->as.str ? value->as.str : "");
            break;
        default:
            setError("unsupported DConf value kind %d", value->kind);
            return -4;
    }

    if (!variant) {
        setError("could not create a DConf variant");
        return -2;
    }

    GError* error = nullptr;
    // write_sync consumes a floating GVariant reference.
    gboolean ok = dconf_client_write_sync(client(), key, variant, nullptr, nullptr, &error);
    if (!ok) {
        setError("%s", error && error->message ? error->message : "dconf_client_write_sync failed");
        if (error) g_error_free(error);
        return -3;
    }
    dconf_client_sync(client());
    return 0;
}

int32_t gea_ffi_dconf_reset(const char* key) {
    clearError();
    if (!key) {
        setError("DConf reset received a null key");
        return -1;
    }

    DConfChangeset* changeset = dconf_changeset_new();
    if (!changeset) {
        setError("could not allocate a DConf changeset");
        return -2;
    }
    dconf_changeset_set(changeset, key, nullptr);

    GError* error = nullptr;
    gboolean ok = dconf_client_change_sync(client(), changeset, nullptr, nullptr, &error);
    dconf_changeset_unref(changeset);
    if (!ok) {
        setError("%s", error && error->message ? error->message : "dconf_client_change_sync failed");
        if (error) g_error_free(error);
        return -3;
    }
    dconf_client_sync(client());
    return 0;
}

int32_t gea_ffi_dconf_sync(void) {
    clearError();
    dconf_client_sync(client());
    return 0;
}

const char* gea_ffi_dconf_last_error(void) {
    return g_last_error;
}

void gea_ffi_dconf_free(void* ptr) {
    std::free(ptr);
}

}

#else

extern "C" {

bool gea_ffi_dconf_available(void) {
    return false;
}

int32_t gea_ffi_dconf_read(const char* key, GeaDconfValue* result) {
    (void)key;
    (void)result;
    setError("this build has no libdconf");
    return -1;
}

int32_t gea_ffi_dconf_write(const char* key, const GeaDconfValue* value) {
    (void)key;
    (void)value;
    setError("this build has no libdconf");
    return -1;
}

int32_t gea_ffi_dconf_reset(const char* key) {
    (void)key;
    setError("this build has no libdconf");
    return -1;
}

int32_t gea_ffi_dconf_sync(void) {
    setError("this build has no libdconf");
    return -1;
}

const char* gea_ffi_dconf_last_error(void) {
    return g_last_error;
}

void gea_ffi_dconf_free(void* ptr) {
    std::free(ptr);
}

}

#endif
