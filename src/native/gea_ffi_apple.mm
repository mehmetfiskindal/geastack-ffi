// SPDX-License-Identifier: Apache-2.0
#if defined(__APPLE__)

#import <Foundation/Foundation.h>
#import <objc/message.h>
#import <objc/runtime.h>

#include "gea/ffi/gea_ffi_apple.h"

#include <cstdlib>

extern void* _NSConcreteGlobalBlock[32];

struct GeaBlockDescriptor {
    unsigned long reserved;
    unsigned long size;
};

struct GeaBlockLayout {
    void* isa;
    int32_t flags;
    int32_t reserved;
    void* invoke;
    GeaBlockDescriptor* descriptor;
};

static GeaBlockDescriptor g_block_descriptor = {
    0,
    sizeof(GeaBlockLayout),
};

namespace {

template <typename Fn>
inline Fn sendFn() {
    return reinterpret_cast<Fn>(objc_msgSend);
}

inline SEL selectorFor(const char* name) {
    return name ? sel_registerName(name) : nullptr;
}

} // namespace

extern "C" {

void* gea_ffi_apple_get_class(const char* name) {
    return name ? (__bridge void*)objc_getClass(name) : nullptr;
}

void* gea_ffi_apple_get_selector(const char* name) {
    return (void*)selectorFor(name);
}

bool gea_ffi_apple_class_exists(const char* name) {
    return name != nullptr && objc_getClass(name) != Nil;
}

void* gea_ffi_apple_create_block(void* invoke) {
    if (!invoke) return nullptr;
    auto* block = static_cast<GeaBlockLayout*>(std::calloc(1, sizeof(GeaBlockLayout)));
    if (!block) return nullptr;
    block->isa = static_cast<void*>(_NSConcreteGlobalBlock);
    block->flags = 0x10000000; // BLOCK_IS_GLOBAL
    block->invoke = invoke;
    block->descriptor = &g_block_descriptor;
    return block;
}

void gea_ffi_apple_release_block(void* block) {
    std::free(block);
}

void* gea_ffi_apple_create_nsstring(const char* utf8_str) {
    if (!utf8_str) return nullptr;
    NSString* nsStr = [NSString stringWithUTF8String:utf8_str];
    return (void*)CFBridgingRetain(nsStr);
}

const char* gea_ffi_apple_nsstring_to_utf8(void* nsstring_ptr) {
    if (!nsstring_ptr) return "";
    NSString* nsStr = (__bridge NSString*)nsstring_ptr;
    const char* utf8 = [nsStr UTF8String];
    return utf8 ? utf8 : "";
}

void gea_ffi_apple_release(void* obj_ptr) {
    if (!obj_ptr) return;
    CFRelease((CFTypeRef)obj_ptr);
}

void* gea_ffi_apple_msg_send_id0(void* target, const char* selector) {
    SEL sel = selectorFor(selector);
    if (!target || !sel) return nullptr;
    return (__bridge void*)sendFn<id (*)(id, SEL)>()((__bridge id)target, sel);
}

void* gea_ffi_apple_msg_send_id_id(void* target, const char* selector, void* arg) {
    SEL sel = selectorFor(selector);
    if (!target || !sel) return nullptr;
    return (__bridge void*)sendFn<id (*)(id, SEL, id)>()((__bridge id)target, sel, (__bridge id)arg);
}

void* gea_ffi_apple_msg_send_id_int(void* target, const char* selector, int32_t arg) {
    SEL sel = selectorFor(selector);
    if (!target || !sel) return nullptr;
    return (__bridge void*)sendFn<id (*)(id, SEL, int32_t)>()((__bridge id)target, sel, arg);
}

void* gea_ffi_apple_msg_send_id_uint(void* target, const char* selector, uint32_t arg) {
    SEL sel = selectorFor(selector);
    if (!target || !sel) return nullptr;
    return (__bridge void*)sendFn<id (*)(id, SEL, uint32_t)>()((__bridge id)target, sel, arg);
}

void* gea_ffi_apple_msg_send_id_double(void* target, const char* selector, double arg) {
    SEL sel = selectorFor(selector);
    if (!target || !sel) return nullptr;
    return (__bridge void*)sendFn<id (*)(id, SEL, double)>()((__bridge id)target, sel, arg);
}

void* gea_ffi_apple_msg_send_id_str(void* target, const char* selector, const char* arg) {
    SEL sel = selectorFor(selector);
    if (!target || !sel) return nullptr;
    return (__bridge void*)sendFn<id (*)(id, SEL, const char*)>()((__bridge id)target, sel, arg);
}

int32_t gea_ffi_apple_msg_send_int0(void* target, const char* selector) {
    SEL sel = selectorFor(selector);
    if (!target || !sel) return 0;
    return sendFn<int32_t (*)(id, SEL)>()((__bridge id)target, sel);
}

uint32_t gea_ffi_apple_msg_send_uint0(void* target, const char* selector) {
    SEL sel = selectorFor(selector);
    if (!target || !sel) return 0;
    return sendFn<uint32_t (*)(id, SEL)>()((__bridge id)target, sel);
}

int64_t gea_ffi_apple_msg_send_long0(void* target, const char* selector) {
    SEL sel = selectorFor(selector);
    if (!target || !sel) return 0;
    return sendFn<int64_t (*)(id, SEL)>()((__bridge id)target, sel);
}

uint64_t gea_ffi_apple_msg_send_ulong0(void* target, const char* selector) {
    SEL sel = selectorFor(selector);
    if (!target || !sel) return 0;
    return sendFn<uint64_t (*)(id, SEL)>()((__bridge id)target, sel);
}

double gea_ffi_apple_msg_send_double0(void* target, const char* selector) {
    SEL sel = selectorFor(selector);
    if (!target || !sel) return 0.0;
    return sendFn<double (*)(id, SEL)>()((__bridge id)target, sel);
}

const char* gea_ffi_apple_msg_send_str0(void* target, const char* selector) {
    SEL sel = selectorFor(selector);
    if (!target || !sel) return "";
    const char* result = sendFn<const char* (*)(id, SEL)>()((__bridge id)target, sel);
    return result ? result : "";
}

void gea_ffi_apple_msg_send_void0(void* target, const char* selector) {
    SEL sel = selectorFor(selector);
    if (!target || !sel) return;
    sendFn<void (*)(id, SEL)>()((__bridge id)target, sel);
}

}

#endif
