// SPDX-License-Identifier: Apache-2.0
#include "gea/ffi/gea_ffi_sailfishos.h"
#include <cstdlib>

namespace gea::ffi::sailfishos {

std::string getDataDirectory(const char* organizationName, const char* applicationName) {
    const char* xdgDataHome = std::getenv("XDG_DATA_HOME");
    std::string base;
    if (xdgDataHome && *xdgDataHome != '\0') {
        base = xdgDataHome;
    } else {
        const char* home = std::getenv("HOME");
        base = (home && *home != '\0') ? std::string(home) + "/.local/share" : "/home/defaultuser/.local/share";
    }
    std::string org = organizationName ? organizationName : "";
    std::string app = applicationName ? applicationName : "";
    return base + "/" + org + "/" + app;
}

std::string getPackageShareDirectory(const char* applicationName) {
    std::string app = applicationName ? applicationName : "";
    return "/usr/share/" + app;
}

} // namespace gea::ffi::sailfishos
