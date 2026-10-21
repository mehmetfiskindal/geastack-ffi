// SPDX-License-Identifier: Apache-2.0
#pragma once

#include "gea_ffi_types.h"
#include "gea_ffi_linux.h"

#if defined(__linux__) && defined(__cplusplus)
#include <string>

namespace gea::ffi::sailfishos {

/**
 * Resolve Sailjail-compliant XDG data directory for the given organization and application name.
 */
std::string getDataDirectory(const char* organizationName, const char* applicationName);

/**
 * Resolve `/usr/share/<appName>` asset directory on SailfishOS.
 */
std::string getPackageShareDirectory(const char* applicationName);

} // namespace gea::ffi::sailfishos
#endif
