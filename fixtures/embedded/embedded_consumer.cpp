// SPDX-License-Identifier: Apache-2.0
/*
 * Compile-only Cortex-M consumer. It exercises the C ABI and the static
 * registration macro without requiring a board or a C runtime.
 */
#include "gea/ffi/gea_ffi.h"

static int gea_embedded_add(int a, int b) {
    return a + b;
}

GEA_FFI_REGISTER_FUNCTION("gea_embedded_add", (void*)&gea_embedded_add);

extern "C" int gea_ffi_embedded_probe(void) {
    int (*add)(int, int) = reinterpret_cast<int (*)(int, int)>(
        gea_ffi_embedded_lookup("gea_embedded_add"));
    int base = static_cast<int>(gea_ffi_embedded_count() + gea_ffi_embedded_capacity());
    return add ? add(base, 0) : base;
}
