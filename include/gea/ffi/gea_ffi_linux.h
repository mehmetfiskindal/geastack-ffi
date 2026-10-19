// SPDX-License-Identifier: Apache-2.0
#pragma once

#if defined(__linux__) && !defined(__ANDROID__)
#include <errno.h>
#include <sys/ioctl.h>
#include <unistd.h>
#endif

#include "gea_ffi_types.h"

#ifdef __cplusplus
#include <string>

namespace gea::ffi::linux_os {

#if defined(__linux__) && !defined(__ANDROID__)
/**
 * Read a trimmed string from a Linux virtual file (/sys/class/* or /proc/*).
 */
std::string readSysfsString(const char* path);

/**
 * Perform a POSIX ioctl call on a file descriptor.
 */
int ioctlCall(int fd, unsigned long request, void* arg);
#endif

} // namespace gea::ffi::linux_os
#endif
