// SPDX-License-Identifier: Apache-2.0
#pragma once

#include "gea_ffi_types.h"
#include "gea_ffi_registry.h"
#include "gea_ffi_apple.h"
#include "gea_ffi_android.h"
#include "gea_ffi_windows.h"
#include "gea_ffi_linux.h"
#include "gea_ffi_sailfishos.h"

#ifdef __cplusplus
#include <string>
#include <vector>

namespace gea::ffi {

class Memory {
public:
    static void* alloc(size_t size);
    static void free(void* ptr);
    static char* strdup(const char* str);
};

class Library {
public:
    static Library* open(const char* path);
    virtual ~Library() = default;

    virtual void* getSymbol(const char* name) = 0;
    virtual void close() = 0;
};

} // namespace gea::ffi
#endif

#ifdef __cplusplus
extern "C" {
#endif

// C-compatible ABI exports for external dynamic linkers
void*   gea_ffi_alloc(size_t size);
void    gea_ffi_free(void* ptr);
void*   gea_ffi_dlopen(const char* path);
void*   gea_ffi_dlsym(void* handle, const char* symbol);
void    gea_ffi_dlclose(void* handle);
int32_t gea_ffi_last_error(void);

#ifdef __cplusplus
}
#endif
