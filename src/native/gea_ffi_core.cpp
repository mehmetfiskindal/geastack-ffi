// SPDX-License-Identifier: Apache-2.0
#include "gea/ffi/gea_ffi.h"
#include <cerrno>
#include <cstdlib>
#include <cstring>

#if defined(_WIN32)
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <windows.h>
#elif defined(__unix__) || defined(__APPLE__)
#include <dlfcn.h>
#include <errno.h>
#endif

namespace {

int32_t g_last_error = 0;

void setLastError(int32_t code) {
    g_last_error = code;
}

} // namespace

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
        void* symbol = reinterpret_cast<void*>(GetProcAddress(static_cast<HMODULE>(m_handle), name));
        setLastError(symbol ? 0 : static_cast<int32_t>(GetLastError()));
        return symbol;
#elif defined(__unix__) || defined(__APPLE__)
        dlerror();
        void* symbol = dlsym(m_handle, name);
        const char* error = dlerror();
        if (error != nullptr) {
            setLastError(errno != 0 ? errno : ENOENT);
            return nullptr;
        }
        setLastError(0);
        return symbol;
#else
        void* symbol = Registry::instance().lookup(name);
        setLastError(symbol ? 0 : ENOENT);
        return symbol;
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
    if (!path) {
        setLastError(ERROR_INVALID_PARAMETER);
        return nullptr;
    }
    int wideLen = MultiByteToWideChar(CP_UTF8, 0, path, -1, nullptr, 0);
    if (wideLen <= 0) {
        setLastError(static_cast<int32_t>(GetLastError()));
        return nullptr;
    }
    std::vector<wchar_t> widePath(static_cast<size_t>(wideLen), L'\0');
    MultiByteToWideChar(CP_UTF8, 0, path, -1, widePath.data(), wideLen);
    HMODULE handle = LoadLibraryW(widePath.data());
    if (!handle) {
        setLastError(static_cast<int32_t>(GetLastError()));
        return nullptr;
    }
    setLastError(0);
    return new PosixLibrary(reinterpret_cast<void*>(handle));
#elif defined(__unix__) || defined(__APPLE__)
    if (!path) {
        setLastError(EINVAL);
        return nullptr;
    }
    void* handle = dlopen(path, RTLD_NOW | RTLD_LOCAL);
    if (!handle) {
        setLastError(errno != 0 ? errno : ENOENT);
        return nullptr;
    }
    setLastError(0);
    return new PosixLibrary(handle);
#else
    if (!path) {
        setLastError(EINVAL);
        return nullptr;
    }
    setLastError(0);
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

int32_t gea_ffi_last_error(void) {
    return g_last_error;
}

}
