// SPDX-License-Identifier: Apache-2.0
#include "gea/ffi/gea_ffi.h"
#include <cstdlib>
#include <cstring>

#if defined(_WIN32)
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#elif defined(__unix__) || defined(__APPLE__)
#include <dlfcn.h>
#endif

namespace gea::ffi {

void* Memory::alloc(size_t size) {
    return std::malloc(size);
}

void Memory::free(void* ptr) {
    std::free(ptr);
}

char* Memory::strdup(const char* str) {
    if (!str) return nullptr;
    size_t len = std::strlen(str);
    char* copy = static_cast<char*>(std::malloc(len + 1));
    if (copy) {
        std::memcpy(copy, str, len + 1);
    }
    return copy;
}

class PosixLibrary : public Library {
public:
    explicit PosixLibrary(void* handle) : m_handle(handle) {}
    ~PosixLibrary() override { close(); }

    void* getSymbol(const char* name) override {
#if defined(_WIN32)
        return reinterpret_cast<void*>(GetProcAddress(static_cast<HMODULE>(m_handle), name));
#elif defined(__unix__) || defined(__APPLE__)
        return dlsym(m_handle, name);
#else
        // Embedded targets: fallback to static registry
        return Registry::instance().lookup(name);
#endif
    }

    void close() override {
        if (m_handle) {
#if defined(_WIN32)
            FreeLibrary(static_cast<HMODULE>(m_handle));
#elif defined(__unix__) || defined(__APPLE__)
            dlclose(m_handle);
#endif
            m_handle = nullptr;
        }
    }

private:
    void* m_handle;
};

Library* Library::open(const char* path) {
#if defined(_WIN32)
    HMODULE handle = LoadLibraryA(path);
    if (!handle) return nullptr;
    return new PosixLibrary(reinterpret_cast<void*>(handle));
#elif defined(__unix__) || defined(__APPLE__)
    void* handle = dlopen(path, RTLD_NOW | RTLD_LOCAL);
    if (!handle) return nullptr;
    return new PosixLibrary(handle);
#else
    // Embedded target without dynamic loader
    return new PosixLibrary(nullptr);
#endif
}

} // namespace gea::ffi

extern "C" {

void* gea_ffi_alloc(size_t size) {
    return gea::ffi::Memory::alloc(size);
}

void gea_ffi_free(void* ptr) {
    gea::ffi::Memory::free(ptr);
}

void* gea_ffi_dlopen(const char* path) {
    return gea::ffi::Library::open(path);
}

void* gea_ffi_dlsym(void* handle, const char* symbol) {
    if (!handle) return nullptr;
    return static_cast<gea::ffi::Library*>(handle)->getSymbol(symbol);
}

void gea_ffi_dlclose(void* handle) {
    if (!handle) return;
    delete static_cast<gea::ffi::Library*>(handle);
}

}
