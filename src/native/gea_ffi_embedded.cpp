// SPDX-License-Identifier: Apache-2.0
#include "gea/ffi/gea_ffi.h"

extern "C" {

bool gea_ffi_embedded_register(const char* name, void* fn_ptr) {
    return gea::ffi::Registry::instance().registerFunction(name, fn_ptr);
}

void* gea_ffi_embedded_lookup(const char* name) {
    return gea::ffi::Registry::instance().lookup(name);
}

bool gea_ffi_embedded_has(const char* name) {
    return gea::ffi::Registry::instance().has(name);
}

bool gea_ffi_embedded_unregister(const char* name) {
    return gea::ffi::Registry::instance().unregisterFunction(name);
}

uint32_t gea_ffi_embedded_count(void) {
    return static_cast<uint32_t>(gea::ffi::Registry::instance().count());
}

uint32_t gea_ffi_embedded_capacity(void) {
    return static_cast<uint32_t>(gea::ffi::Registry::capacity());
}

void gea_ffi_embedded_clear(void) {
    gea::ffi::Registry::instance().clear();
}

}
