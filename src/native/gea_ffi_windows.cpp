// SPDX-License-Identifier: Apache-2.0
#include "gea/ffi/gea_ffi_windows.h"

#if defined(_WIN32)
#include <vector>

namespace gea::ffi::windows {

std::wstring utf8ToWide(const char* utf8Str) {
    if (!utf8Str || *utf8Str == '\0') return std::wstring();
    int wideLen = MultiByteToWideChar(CP_UTF8, 0, utf8Str, -1, nullptr, 0);
    if (wideLen <= 0) return std::wstring();
    std::wstring result(static_cast<size_t>(wideLen), L'\0');
    MultiByteToWideChar(CP_UTF8, 0, utf8Str, -1, result.data(), wideLen);
    result.resize(static_cast<size_t>(wideLen - 1));
    return result;
}

std::string wideToUtf8(const wchar_t* wideStr) {
    if (!wideStr || *wideStr == L'\0') return std::string();
    int utf8Len = WideCharToMultiByte(CP_UTF8, 0, wideStr, -1, nullptr, 0, nullptr, nullptr);
    if (utf8Len <= 0) return std::string();
    std::string result(static_cast<size_t>(utf8Len), '\0');
    WideCharToMultiByte(CP_UTF8, 0, wideStr, -1, result.data(), utf8Len, nullptr, nullptr);
    result.resize(static_cast<size_t>(utf8Len - 1));
    return result;
}

ComScope::ComScope(DWORD coInit) {
    m_hr = CoInitializeEx(nullptr, coInit);
    m_initialized = (m_hr == S_OK || m_hr == S_FALSE);
}

ComScope::~ComScope() {
    if (m_initialized) {
        CoUninitialize();
    }
}

std::string readRegistryString(HKEY rootKey, const char* subKey, const char* valueName) {
    std::wstring wSubKey = utf8ToWide(subKey);
    std::wstring wValueName = utf8ToWide(valueName);
    DWORD dataSize = 0;

    LSTATUS status = RegGetValueW(
        rootKey,
        wSubKey.c_str(),
        wValueName.c_str(),
        RRF_RT_REG_SZ,
        nullptr,
        nullptr,
        &dataSize
    );
    if (status != ERROR_SUCCESS || dataSize == 0) {
        return std::string();
    }

    std::vector<wchar_t> buffer(dataSize / sizeof(wchar_t) + 1, L'\0');
    status = RegGetValueW(
        rootKey,
        wSubKey.c_str(),
        wValueName.c_str(),
        RRF_RT_REG_SZ,
        nullptr,
        buffer.data(),
        &dataSize
    );
    if (status != ERROR_SUCCESS) {
        return std::string();
    }

    return wideToUtf8(buffer.data());
}

} // namespace gea::ffi::windows
#endif
