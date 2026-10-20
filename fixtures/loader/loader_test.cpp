// SPDX-License-Identifier: Apache-2.0
#include "gea/ffi/gea_ffi.h"

#include <cstdint>
#include <cstdio>
#include <cstring>

#if defined(_WIN32)
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <windows.h>
#else
#include <sys/time.h>
#endif

static int fail(const char* message) {
    std::fprintf(stderr, "loader_test: %s (last_error=%d)\n", message, gea_ffi_last_error());
    return 1;
}

int main() {
#if defined(_WIN32)
    const char* missingName = "gea_ffi_missing_library_9f3a.dll";
    const char* libraryName = "kernel32.dll";
#else
    const char* missingName = "libgea_ffi_missing_9f3a.so";
    const char* libraryName = "libc.so.6";
#endif

    void* missing = gea_ffi_dlopen(missingName);
    if (missing != nullptr) return fail("missing library opened");
    if (gea_ffi_last_error() == 0) return fail("missing library did not record an error");

    void* library = gea_ffi_dlopen(libraryName);
    if (library == nullptr) return fail("library open failed");

#if defined(_WIN32)
    using GetPid = std::uint32_t (*)();
    auto getPid = reinterpret_cast<GetPid>(gea_ffi_dlsym(library, "GetCurrentProcessId"));
    if (getPid == nullptr) return fail("GetCurrentProcessId missing");
    if (getPid() == 0) return fail("GetCurrentProcessId returned 0");
#else
    using GetPid = int (*)();
    auto getPid = reinterpret_cast<GetPid>(gea_ffi_dlsym(library, "getpid"));
    if (getPid == nullptr) return fail("getpid missing");
    if (getPid() <= 0) return fail("getpid returned a non-positive pid");

    using GetTimeOfDay = int (*)(struct timeval*, void*);
    auto nowFn = reinterpret_cast<GetTimeOfDay>(gea_ffi_dlsym(library, "gettimeofday"));
    if (nowFn == nullptr) return fail("gettimeofday missing");
    struct timeval now{};
    if (offsetof(struct timeval, tv_sec) != 0) return fail("tv_sec offset");
    if (offsetof(struct timeval, tv_usec) != 8) return fail("tv_usec offset");
    if (sizeof(struct timeval) != 16) return fail("timeval size");
    if (nowFn(&now, nullptr) != 0) return fail("gettimeofday call");
    if (now.tv_sec < 1700000000) return fail("tv_sec range");

    using MallocFn = void* (*)(std::size_t);
    using FreeFn = void (*)(void*);
    auto allocate = reinterpret_cast<MallocFn>(gea_ffi_dlsym(library, "malloc"));
    auto release = reinterpret_cast<FreeFn>(gea_ffi_dlsym(library, "free"));
    if (allocate == nullptr || release == nullptr) return fail("malloc/free missing");
    void* block = allocate(64);
    if (block == nullptr) return fail("malloc returned null");
    std::memset(block, 0xab, 64);
    release(block);
#endif

    if (gea_ffi_dlsym(library, "this_symbol_does_not_exist") != nullptr) {
        return fail("missing symbol resolved");
    }
    if (gea_ffi_last_error() == 0) return fail("missing symbol did not record an error");

    void* memory = gea_ffi_alloc(32);
    if (memory == nullptr) return fail("gea_ffi_alloc");
    std::memset(memory, 0, 32);
    gea_ffi_free(memory);

    gea_ffi_dlclose(library);
    std::puts("loader_test ok");
    return 0;
}
