// SPDX-License-Identifier: Apache-2.0
/*
 * Host test for the allocation-free embedded symbol registry.
 * Run on a desktop host; the same source is cross-compiled for Cortex-M.
 */
#include "gea/ffi/gea_ffi.h"

#include <cstdio>
#include <cstring>
#include <string>
#include <vector>

static int fail(const char* message) {
    std::fprintf(stderr, "embedded_test: %s\n", message);
    return 1;
}

static int add(int a, int b) {
    return a + b;
}

static int subtract(int a, int b) {
    return a - b;
}

static int triple(int value) {
    return value * 3;
}

GEA_FFI_REGISTER_FUNCTION("triple", (void*)&triple);

int main() {
    using BinaryFn = int (*)(int, int);
    using UnaryFn = int (*)(int);

    // Static auto-registration ran before main.
    if (!gea_ffi_embedded_has("triple")) return fail("auto-registered symbol missing");
    auto tripleFn = reinterpret_cast<UnaryFn>(gea_ffi_embedded_lookup("triple"));
    if (!tripleFn || tripleFn(14) != 42) return fail("auto-registered symbol did not call");
    if (gea_ffi_embedded_count() != 1) return fail("auto-registration count mismatch");

    gea_ffi_embedded_clear();
    if (gea_ffi_embedded_count() != 0) return fail("clear did not reset the table");
    if (gea_ffi_embedded_capacity() != 128) return fail("default capacity mismatch");

    if (!gea_ffi_embedded_register("add", (void*)&add)) return fail("register failed");
    if (!gea_ffi_embedded_has("add")) return fail("has failed");
    auto addFn = reinterpret_cast<BinaryFn>(gea_ffi_embedded_lookup("add"));
    if (!addFn || addFn(19, 23) != 42) return fail("registered symbol did not call");
    if (gea_ffi_embedded_has("missing")) return fail("missing symbol reported as present");
    if (gea_ffi_embedded_lookup("missing") != nullptr) return fail("missing lookup returned a pointer");
    if (gea_ffi_embedded_register(nullptr, (void*)&add)) return fail("null name was accepted");
    if (gea_ffi_embedded_register("nullptr", nullptr)) return fail("null function was accepted");

    // Re-registering replaces in place.
    if (!gea_ffi_embedded_register("add", (void*)&subtract)) return fail("re-register failed");
    auto subFn = reinterpret_cast<BinaryFn>(gea_ffi_embedded_lookup("add"));
    if (!subFn || subFn(50, 8) != 42) return fail("replaced symbol did not call");
    if (gea_ffi_embedded_count() != 1) return fail("replace changed the count");

    if (!gea_ffi_embedded_unregister("add")) return fail("unregister failed");
    if (gea_ffi_embedded_has("add")) return fail("unregistered symbol still present");
    if (gea_ffi_embedded_unregister("add")) return fail("double unregister succeeded");

    // Fill the fixed table and reject one more entry.
    gea_ffi_embedded_clear();
    const uint32_t capacity = gea_ffi_embedded_capacity();
    std::vector<std::string> names;
    names.reserve(capacity);
    for (uint32_t i = 0; i < capacity; ++i) {
        names.push_back("symbol_" + std::to_string(i));
        if (!gea_ffi_embedded_register(names.back().c_str(), (void*)&add)) {
            return fail("registration failed before capacity");
        }
    }
    if (gea_ffi_embedded_count() != capacity) return fail("capacity count mismatch");
    if (gea_ffi_embedded_register("overflow", (void*)&add)) return fail("overflow entry was accepted");
    if (gea_ffi_embedded_has("overflow")) return fail("overflow entry is present");
    if (gea_ffi_embedded_lookup(names.front().c_str()) == nullptr) return fail("first entry lookup failed");
    if (gea_ffi_embedded_lookup(names.back().c_str()) == nullptr) return fail("last entry lookup failed");

    gea_ffi_embedded_clear();
    if (gea_ffi_embedded_count() != 0) return fail("final clear failed");

    std::puts("embedded_test ok");
    return 0;
}
