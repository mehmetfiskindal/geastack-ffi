// SPDX-License-Identifier: Apache-2.0
#pragma once

#include "gea_ffi_types.h"

#ifdef __cplusplus
#include <unordered_map>
#include <string>
#include <functional>

namespace gea::ffi {

using NativeFunctionPtr = void* (*)(void*);

class Registry {
public:
    static Registry& instance() {
        static Registry s_instance;
        return s_instance;
    }

    void registerFunction(const std::string& name, void* fnPtr) {
        m_functions[name] = fnPtr;
    }

    void* lookup(const std::string& name) const {
        auto it = m_functions.find(name);
        return (it != m_functions.end()) ? it->second : nullptr;
    }

    bool has(const std::string& name) const {
        return m_functions.find(name) != m_functions.end();
    }

private:
    std::unordered_map<std::string, void*> m_functions;
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
