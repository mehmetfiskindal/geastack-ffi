// SPDX-License-Identifier: Apache-2.0
#include "gea/ffi/gea_ffi_windows.h"

#include <cstdio>
#include <string>

int main() {
    const std::string original = u8"GeaStack T\u00FCrk\u00E7e \U0001F680";
    const std::wstring wide = gea::ffi::windows::utf8ToWide(original.c_str());
    if (wide.empty()) {
        std::puts("windows_native_test failed: utf8ToWide");
        return 1;
    }
    if (gea::ffi::windows::wideToUtf8(wide.c_str()) != original) {
        std::puts("windows_native_test failed: wideToUtf8");
        return 1;
    }

    gea::ffi::windows::ComScope com;
    if (!com.isInitialized() || com.hresult() != S_OK) {
        std::puts("windows_native_test failed: ComScope");
        return 1;
    }

    const std::string product = gea::ffi::windows::readRegistryString(
        HKEY_LOCAL_MACHINE,
        "SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion",
        "ProductName"
    );
    if (product.empty()) {
        std::puts("windows_native_test failed: ProductName");
        return 1;
    }

    std::printf("product=%s\n", product.c_str());
    std::puts("windows_native_test ok");
    return 0;
}
