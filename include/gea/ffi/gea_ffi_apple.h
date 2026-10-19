// SPDX-License-Identifier: Apache-2.0
#pragma once

#if defined(__APPLE__)
#include <objc/message.h>
#include <objc/runtime.h>
#endif

#include "gea_ffi_types.h"

#ifdef __cplusplus
namespace gea::ffi::apple {

#if defined(__APPLE__)
inline Class getClass(const char* name) {
    return objc_getClass(name);
}

inline SEL getSelector(const char* name) {
    return sel_registerName(name);
}
#endif

} // namespace gea::ffi::apple
#endif
