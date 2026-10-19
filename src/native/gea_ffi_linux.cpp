// SPDX-License-Identifier: Apache-2.0
#include "gea/ffi/gea_ffi_linux.h"

#if defined(__linux__) && !defined(__ANDROID__)
#include <fstream>
#include <sstream>

namespace gea::ffi::linux_os {

std::string readSysfsString(const char* path) {
    if (!path) return std::string();
    std::ifstream file(path);
    if (!file.is_open()) return std::string();
    std::ostringstream ss;
    ss << file.rdbuf();
    std::string content = ss.str();
    while (!content.empty() && (content.back() == '\n' || content.back() == '\r' || content.back() == ' ')) {
        content.pop_back();
    }
    return content;
}

int ioctlCall(int fd, unsigned long request, void* arg) {
    return ::ioctl(fd, request, arg);
}

} // namespace gea::ffi::linux_os
#endif
