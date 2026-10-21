// SPDX-License-Identifier: Apache-2.0
/*
 * iOS simulator runtime test.
 *
 * Built for iphonesimulator and executed with `xcrun simctl spawn`. It uses the
 * same gea_ffi_apple_* entry points the device build exposes and also tries the
 * dlopen path against libSystem.
 */
#import <Foundation/Foundation.h>

#include "gea/ffi/gea_ffi.h"

#include <cstdio>
#include <cstring>
#include <unistd.h>

static int fail(const char* message) {
    std::fprintf(stderr, "ios_sim_test: %s\n", message);
    return 1;
}

int main() {
    if (!gea_ffi_apple_class_exists("NSString")) return fail("NSString is not registered");
    if (gea_ffi_apple_class_exists("GEAFFINoSuchClass9f3a")) return fail("missing class reported as present");

    void* nsStringClass = gea_ffi_apple_get_class("NSString");
    if (!nsStringClass) return fail("NSString lookup failed");

    void* string = gea_ffi_apple_msg_send_id_str(nsStringClass, "stringWithUTF8String:", "geastack");
    if (!string) return fail("[NSString stringWithUTF8String:] returned nil");
    if (std::strcmp(gea_ffi_apple_msg_send_str0(string, "UTF8String"), "geastack") != 0) {
        return fail("UTF8String round-trip failed");
    }
    if (gea_ffi_apple_msg_send_ulong0(string, "length") != 8) return fail("NSString length mismatch");

    void* processInfoClass = gea_ffi_apple_get_class("NSProcessInfo");
    if (!processInfoClass) return fail("NSProcessInfo lookup failed");
    void* processInfo = gea_ffi_apple_msg_send_id0(processInfoClass, "processInfo");
    if (!processInfo) return fail("[NSProcessInfo processInfo] returned nil");
    int32_t pid = gea_ffi_apple_msg_send_int0(processInfo, "processIdentifier");
    if (pid <= 0 || pid != getpid()) return fail("processIdentifier mismatch");

    void* retained = gea_ffi_apple_create_nsstring("h\xC3\xA9llo");
    if (!retained) return fail("create_nsstring returned nil");
    if (std::strcmp(gea_ffi_apple_nsstring_to_utf8(retained), "h\xC3\xA9llo") != 0) {
        return fail("NSString UTF-8 round-trip failed");
    }
    gea_ffi_apple_release(retained);

    if (gea_ffi_apple_msg_send_id0(nullptr, "description") != nullptr) return fail("nil target returned an object");
    gea_ffi_apple_msg_send_void0(nullptr, "release");

    // The loader path on iOS: system libraries are already mapped and can be
    // opened with dlopen. App Store apps cannot load arbitrary dylibs.
    void* libSystem = gea_ffi_dlopen("libSystem.B.dylib");
    if (libSystem) {
        using GetPid = int (*)();
        auto getpidFn = reinterpret_cast<GetPid>(gea_ffi_dlsym(libSystem, "getpid"));
        if (!getpidFn) return fail("getpid missing from libSystem");
        if (getpidFn() != getpid()) return fail("dlsym getpid mismatch");
        gea_ffi_dlclose(libSystem);
    } else {
        std::printf("[skip] dlopen(libSystem.B.dylib) failed: %d\n", gea_ffi_last_error());
    }

    std::puts("ios_sim_test ok");
    return 0;
}
