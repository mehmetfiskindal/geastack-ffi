// SPDX-License-Identifier: Apache-2.0
#pragma once

#include "gea_ffi_types.h"

#if defined(__APPLE__)
#include <objc/message.h>
#include <objc/runtime.h>
#endif

#ifdef __cplusplus
namespace gea::ffi::apple {

#if defined(__APPLE__)
inline Class getClass(const char* name) {
    return name ? objc_getClass(name) : Nil;
}

inline SEL getSelector(const char* name) {
    return name ? sel_registerName(name) : nullptr;
}
#endif

} // namespace gea::ffi::apple
#endif

#ifdef __cplusplus
extern "C" {
#endif

#if defined(__APPLE__)

/*
 * Thin, typed Objective-C runtime entry points for native embedders.
 *
 * `objc_msgSend` must be called through a function pointer whose signature
 * matches the method exactly; these wrappers cover the common ABI shapes and
 * keep the casts in one reviewed place. All functions accept a nil target and
 * return zero/nil for it, matching Objective-C nil messaging.
 */

void*       gea_ffi_apple_get_class(const char* name);
void*       gea_ffi_apple_get_selector(const char* name);
bool        gea_ffi_apple_class_exists(const char* name);

/** Create a +1 retained NSString. Release it with gea_ffi_apple_release(). */
void*       gea_ffi_apple_create_nsstring(const char* utf8_str);
const char* gea_ffi_apple_nsstring_to_utf8(void* nsstring_ptr);
void        gea_ffi_apple_release(void* obj_ptr);

/**
 * Create a global Objective-C block whose invoke pointer is supplied by the
 * caller. The invoke function receives the block itself as its first argument,
 * followed by the block's declared arguments. Free it with
 * gea_ffi_apple_release_block().
 */
void*       gea_ffi_apple_create_block(void* invoke);
void        gea_ffi_apple_release_block(void* block);

void*       gea_ffi_apple_msg_send_id0(void* target, const char* selector);
void*       gea_ffi_apple_msg_send_id_id(void* target, const char* selector, void* arg);
void*       gea_ffi_apple_msg_send_id_int(void* target, const char* selector, int32_t arg);
void*       gea_ffi_apple_msg_send_id_uint(void* target, const char* selector, uint32_t arg);
void*       gea_ffi_apple_msg_send_id_double(void* target, const char* selector, double arg);
void*       gea_ffi_apple_msg_send_id_str(void* target, const char* selector, const char* arg);

int32_t     gea_ffi_apple_msg_send_int0(void* target, const char* selector);
uint32_t    gea_ffi_apple_msg_send_uint0(void* target, const char* selector);
int64_t     gea_ffi_apple_msg_send_long0(void* target, const char* selector);
uint64_t    gea_ffi_apple_msg_send_ulong0(void* target, const char* selector);
double      gea_ffi_apple_msg_send_double0(void* target, const char* selector);
const char* gea_ffi_apple_msg_send_str0(void* target, const char* selector);
void        gea_ffi_apple_msg_send_void0(void* target, const char* selector);

#endif

#ifdef __cplusplus
}
#endif
