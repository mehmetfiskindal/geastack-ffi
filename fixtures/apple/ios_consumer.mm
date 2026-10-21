// SPDX-License-Identifier: Apache-2.0
/*
 * Compile-time consumer for the iOS static library.
 *
 * This object is built for both the simulator and device SDKs. It is not run;
 * it proves that the public C++/Objective-C headers and the typed runtime
 * wrappers are usable from an iOS target.
 */
#import <Foundation/Foundation.h>

#include "gea/ffi/gea_ffi.h"

extern "C" void* gea_ffi_ios_consumer(void) {
    if (!gea_ffi_apple_class_exists("NSString")) return nullptr;
    void* nsStringClass = gea_ffi_apple_get_class("NSString");
    void* string = gea_ffi_apple_msg_send_id_str(nsStringClass, "stringWithUTF8String:", "geastack-ios");
    if (!string) return nullptr;
    uint64_t length = gea_ffi_apple_msg_send_ulong0(string, "length");
    if (length != 12) {
        gea_ffi_apple_release(string);
        return nullptr;
    }
    return string;
}
