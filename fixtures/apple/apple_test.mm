// SPDX-License-Identifier: Apache-2.0
/*
 * Host test for the native Apple/Objective-C backend.
 *
 * Exercises the same objc_msgSend trampolines the iOS build uses. Run on macOS:
 *   npm run test:apple-native
 */
#import <Foundation/Foundation.h>

#include "gea/ffi/gea_ffi_apple.h"

#include <cstdio>
#include <cstring>
#include <unistd.h>

static int fail(const char* message) {
    std::fprintf(stderr, "apple_test: %s\n", message);
    return 1;
}

int main() {
    if (!gea_ffi_apple_class_exists("NSString")) return fail("NSString is not registered");
    if (gea_ffi_apple_class_exists("GEAFFINoSuchClass9f3a")) return fail("missing class reported as present");
    if (gea_ffi_apple_get_class("GEAFFINoSuchClass9f3a") != nullptr) return fail("missing class returned a pointer");

    void* nsStringClass = gea_ffi_apple_get_class("NSString");
    if (!nsStringClass) return fail("NSString lookup failed");
    if (!gea_ffi_apple_get_selector("stringWithUTF8String:")) return fail("selector lookup failed");

    void* string = gea_ffi_apple_msg_send_id_str(nsStringClass, "stringWithUTF8String:", "geastack");
    if (!string) return fail("[NSString stringWithUTF8String:] returned nil");

    const char* utf8 = gea_ffi_apple_msg_send_str0(string, "UTF8String");
    if (std::strcmp(utf8, "geastack") != 0) return fail("UTF8String round-trip failed");

    uint64_t length = gea_ffi_apple_msg_send_ulong0(string, "length");
    if (length != 8) return fail("NSString length mismatch");

    void* processInfoClass = gea_ffi_apple_get_class("NSProcessInfo");
    if (!processInfoClass) return fail("NSProcessInfo lookup failed");
    void* processInfo = gea_ffi_apple_msg_send_id0(processInfoClass, "processInfo");
    if (!processInfo) return fail("[NSProcessInfo processInfo] returned nil");
    int32_t pid = gea_ffi_apple_msg_send_int0(processInfo, "processIdentifier");
    if (pid <= 0 || pid != getpid()) return fail("processIdentifier mismatch");

    void* retained = gea_ffi_apple_create_nsstring("h\xC3\xA9llo");
    if (!retained) return fail("gea_ffi_apple_create_nsstring returned nil");
    const char* retainedUtf8 = gea_ffi_apple_nsstring_to_utf8(retained);
    if (std::strcmp(retainedUtf8, "h\xC3\xA9llo") != 0) return fail("NSUTF8StringEncoding round-trip failed");
    gea_ffi_apple_release(retained);

    // Nil messaging must be a no-op with zero results.
    if (gea_ffi_apple_msg_send_id0(nullptr, "description") != nullptr) return fail("nil target returned an object");
    if (gea_ffi_apple_msg_send_int0(nullptr, "processIdentifier") != 0) return fail("nil target returned an int");
    if (std::strcmp(gea_ffi_apple_msg_send_str0(nullptr, "UTF8String"), "") != 0) return fail("nil target returned a string");
    gea_ffi_apple_msg_send_void0(nullptr, "release");

    std::puts("apple_test ok");
    return 0;
}
