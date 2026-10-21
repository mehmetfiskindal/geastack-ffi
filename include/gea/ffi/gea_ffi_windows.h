// SPDX-License-Identifier: Apache-2.0
#pragma once

#if defined(_WIN32)
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <windows.h>
#include <objbase.h>
#endif

#include "gea_ffi_types.h"

#if defined(_WIN32) && defined(__cplusplus)
#include <string>

namespace gea::ffi::windows {
/**
 * Convert a UTF-8 C string to a UTF-16 std::wstring for Win32 W-suffixed APIs.
 */
std::wstring utf8ToWide(const char* utf8Str);

/**
 * Convert a UTF-16 wchar_t* string back to a UTF-8 std::string.
 */
std::string wideToUtf8(const wchar_t* wideStr);

/**
 * RAII COM Apartment Initializer Scope.
 */
class ComScope {
public:
    explicit ComScope(DWORD coInit = COINIT_MULTITHREADED);
    ~ComScope();
    bool isInitialized() const { return m_initialized; }
    HRESULT hresult() const { return m_hr; }

private:
    HRESULT m_hr;
    bool m_initialized;
};

/**
 * Read a REG_SZ string from the Windows Registry as UTF-8.
 */
std::string readRegistryString(HKEY rootKey, const char* subKey, const char* valueName);

} // namespace gea::ffi::windows
#endif
