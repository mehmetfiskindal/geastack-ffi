// SPDX-License-Identifier: Apache-2.0
#pragma once

#include "gea_ffi_types.h"

#ifdef __cplusplus

namespace gea::ffi {

using NativeFunctionPtr = void* (*)(void*);

/** Avoid <cstring> so the registry also builds in freestanding environments. */
inline bool sameSymbolName(const char* left, const char* right) {
    if (!left || !right) return false;
    while (*left && *left == *right) {
        ++left;
        ++right;
    }
    return *left == *right;
}

/**
 * Maximum number of statically registered symbols.
 * Override with -DGEA_FFI_REGISTRY_CAPACITY=<n> consistently for the whole
 * firmware image. The table is embedded in the Registry object, so registration
 * performs no heap allocation.
 */
#ifndef GEA_FFI_REGISTRY_CAPACITY
#define GEA_FFI_REGISTRY_CAPACITY 128
#endif

/**
 * Allocation-free symbol table for AOT and microcontroller targets.
 *
 * Names are stored by pointer; register string literals or storage that lives
 * for the whole program. The table is not thread-safe; register during startup
 * before other threads use the registry.
 */
class Registry {
public:
    static Registry& instance() {
        static Registry s_instance;
        return s_instance;
    }

    static constexpr size_t capacity() {
        return static_cast<size_t>(GEA_FFI_REGISTRY_CAPACITY);
    }

    /** Register or replace a symbol. Returns false for null input or a full table. */
    bool registerFunction(const char* name, void* fnPtr) {
        if (!name || !fnPtr) return false;
        for (size_t i = 0; i < m_count; ++i) {
            if (sameSymbolName(m_entries[i].name, name)) {
                m_entries[i].fnPtr = fnPtr;
                return true;
            }
        }
        if (m_count >= capacity()) return false;
        m_entries[m_count].name = name;
        m_entries[m_count].fnPtr = fnPtr;
        ++m_count;
        return true;
    }

    /** Remove a symbol. Returns true when it existed. */
    bool unregisterFunction(const char* name) {
        if (!name) return false;
        for (size_t i = 0; i < m_count; ++i) {
            if (sameSymbolName(m_entries[i].name, name)) {
                for (size_t j = i + 1; j < m_count; ++j) {
                    m_entries[j - 1] = m_entries[j];
                }
                --m_count;
                m_entries[m_count].name = nullptr;
                m_entries[m_count].fnPtr = nullptr;
                return true;
            }
        }
        return false;
    }

    void* lookup(const char* name) const {
        if (!name) return nullptr;
        for (size_t i = 0; i < m_count; ++i) {
            if (sameSymbolName(m_entries[i].name, name)) {
                return m_entries[i].fnPtr;
            }
        }
        return nullptr;
    }

    bool has(const char* name) const {
        return lookup(name) != nullptr;
    }

    size_t count() const {
        return m_count;
    }

    void clear() {
        for (size_t i = 0; i < m_count; ++i) {
            m_entries[i].name = nullptr;
            m_entries[i].fnPtr = nullptr;
        }
        m_count = 0;
    }

private:
    struct Entry {
        const char* name;
        void* fnPtr;
    };

    Entry m_entries[GEA_FFI_REGISTRY_CAPACITY]{};
    size_t m_count = 0;
};

// Helper auto-registration struct
struct AutoRegisterFunction {
    AutoRegisterFunction(const char* name, void* fnPtr) {
        Registry::instance().registerFunction(name, fnPtr);
    }
};

} // namespace gea::ffi

#define GEA_FFI_CONCAT_IMPL(s1, s2) s1##s2
#define GEA_FFI_CONCAT(s1, s2) GEA_FFI_CONCAT_IMPL(s1, s2)

/**
 * Macro to statically register a native C/C++ function for AOT and embedded targets.
 * Usage:
 *   GEA_FFI_REGISTER_FUNCTION("esp_wifi_init", (void*)&esp_wifi_init);
 */
#define GEA_FFI_REGISTER_FUNCTION(name, fnPtr) \
    static const ::gea::ffi::AutoRegisterFunction GEA_FFI_CONCAT(_gea_ffi_reg_, __LINE__)(name, (void*)(fnPtr))

#endif // __cplusplus

#ifdef __cplusplus
extern "C" {
#endif

/** C ABI for native embedders. Returns false for null input or a full table. */
bool     gea_ffi_embedded_register(const char* name, void* fn_ptr);
void*    gea_ffi_embedded_lookup(const char* name);
bool     gea_ffi_embedded_has(const char* name);
bool     gea_ffi_embedded_unregister(const char* name);
uint32_t gea_ffi_embedded_count(void);
uint32_t gea_ffi_embedded_capacity(void);
void     gea_ffi_embedded_clear(void);

#ifdef __cplusplus
}
#endif
