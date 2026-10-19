// SPDX-License-Identifier: Apache-2.0
#if defined(__APPLE__)

#import <Foundation/Foundation.h>
#import "gea/ffi/gea_ffi.h"

extern "C" {

void* gea_ffi_apple_get_class(const char* name) {
    return (__bridge void*)objc_getClass(name);
}

void* gea_ffi_apple_get_selector(const char* name) {
    return (void*)sel_registerName(name);
}

void* gea_ffi_apple_create_nsstring(const char* utf8_str) {
    if (!utf8_str) return nullptr;
    NSString* nsStr = [NSString stringWithUTF8String:utf8_str];
    return (__bridge_retained void*)nsStr;
}

const char* gea_ffi_apple_nsstring_to_utf8(void* nsstring_ptr) {
    if (!nsstring_ptr) return "";
    NSString* nsStr = (__bridge NSString*)nsstring_ptr;
    return [nsStr UTF8String];
}

void gea_ffi_apple_release(void* obj_ptr) {
    if (!obj_ptr) return;
    CFRelease((CFTypeRef)obj_ptr);
}

}

#endif
