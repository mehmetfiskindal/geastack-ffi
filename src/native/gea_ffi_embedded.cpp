// SPDX-License-Identifier: Apache-2.0
#include "gea/ffi/gea_ffi.h"

extern "C" {

void gea_ffi_embedded_register(const char* name, void* fn_ptr) {
    if (!name || !fn_ptr) return;
    gea::ffi::Registry::instance().registerFunction(name, fn_ptr);
}

void* gea_ffi_embedded_lookup(const char* name) {
    if (!name) return nullptr;
    return gea::ffi::Registry::instance().lookup(name);
}

bool gea_ffi_embedded_has(const char* name) {
    if (!name) return false;
    return gea::ffi::Registry::instance().has(name);
}

}
