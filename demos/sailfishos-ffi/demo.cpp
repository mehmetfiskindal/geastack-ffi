// SPDX-License-Identifier: Apache-2.0
/*
 * Sailfish OS FFI demo.
 *
 * Exercises the real Linux/Sailfish paths:
 *   - dlopen/dlsym of libc.so.6 (getpid, strlen, gettimeofday, malloc/free)
 *   - Sailjail XDG data directory and package share directory
 *   - libdbus session-bus calls (GetId, NameHasOwner) when a bus is available
 *
 * Build with CMake (see README.md) or the Sailfish SDK.
 */
#include "gea/ffi/gea_ffi.h"

#include <cstdio>
#include <cstring>
#include <string>
#include <sys/time.h>
#include <unistd.h>

static int failures = 0;

static void check(const char* name, bool ok, const char* detail = nullptr) {
    std::printf("%s %s", ok ? "[ok]  " : "[FAIL]", name);
    if (detail && *detail) std::printf(": %s", detail);
    std::printf("\n");
    if (!ok) ++failures;
}

int main() {
    std::printf("@geastack/ffi Sailfish OS demo\n\n");

    gea::ffi::Library* libc = gea::ffi::Library::open("libc.so.6");
    if (!libc) {
        std::fprintf(stderr, "libc.so.6 could not be opened (last_error=%d)\n", gea_ffi_last_error());
        return 1;
    }

    using GetPid = int (*)();
    using Strlen = std::size_t (*)(const char*);
    using GetTimeOfDay = int (*)(struct timeval*, void*);
    using Malloc = void* (*)(std::size_t);
    using Free = void (*)(void*);

    auto getpidFn = reinterpret_cast<GetPid>(libc->getSymbol("getpid"));
    auto strlenFn = reinterpret_cast<Strlen>(libc->getSymbol("strlen"));
    auto gettimeofdayFn = reinterpret_cast<GetTimeOfDay>(libc->getSymbol("gettimeofday"));
    auto mallocFn = reinterpret_cast<Malloc>(libc->getSymbol("malloc"));
    auto freeFn = reinterpret_cast<Free>(libc->getSymbol("free"));

    if (getpidFn && strlenFn && gettimeofdayFn && mallocFn && freeFn) {
        char pidText[32];
        std::snprintf(pidText, sizeof(pidText), "%d", getpidFn());
        check("libc.so.6 getpid", getpidFn() > 0, pidText);
        check("libc.so.6 strlen(\"geastack\")", strlenFn("geastack") == 8, "8");

        struct timeval now{};
        check("libc.so.6 gettimeofday", gettimeofdayFn(&now, nullptr) == 0,
              now.tv_sec > 1700000000 ? "time is set" : "time looks wrong");

        void* block = mallocFn(64);
        if (block) std::memset(block, 0x5a, 64);
        check("libc.so.6 malloc/free", block != nullptr);
        if (block) freeFn(block);
    } else {
        check("libc.so.6 symbols", false, "getpid/strlen/gettimeofday/malloc/free");
    }

    std::string dataDir = gea::ffi::sailfishos::getDataDirectory("com.geastack", "harbour-geaffi");
    std::string shareDir = gea::ffi::sailfishos::getPackageShareDirectory("harbour-geaffi");
    check("Sailjail data directory", dataDir.find("com.geastack/harbour-geaffi") != std::string::npos, dataDir.c_str());
    check("Sailfish package share directory", shareDir == "/usr/share/harbour-geaffi", shareDir.c_str());

#ifndef GEA_FFI_DEMO_NO_DBUS
    void* bus = nullptr;
    int32_t connected = gea_ffi_dbus_connect(0, &bus);
    if (connected == 0 && bus) {
        const char* uniqueName = gea_ffi_dbus_unique_name(bus);
        check("D-Bus session connection", uniqueName && uniqueName[0] == ':', uniqueName);

        GeaDbusValue reply[2]{};
        int32_t count = 0;
        if (gea_ffi_dbus_call(bus, "org.freedesktop.DBus", "/org/freedesktop/DBus",
                              "org.freedesktop.DBus", "GetId", nullptr, 0,
                              reply, 2, &count) == 0 && count == 1) {
            check("D-Bus GetId", reply[0].kind == GEA_DBUS_STRING && std::strlen(reply[0].as.str) > 0,
                  reply[0].as.str);
            gea_ffi_dbus_free(const_cast<char*>(reply[0].as.str));
        } else {
            check("D-Bus GetId", false, gea_ffi_dbus_last_error());
        }

        GeaDbusValue owner{};
        owner.kind = GEA_DBUS_STRING;
        owner.as.str = "org.freedesktop.DBus";
        GeaDbusValue result{};
        count = 0;
        if (gea_ffi_dbus_call(bus, "org.freedesktop.DBus", "/org/freedesktop/DBus",
                              "org.freedesktop.DBus", "NameHasOwner", &owner, 1,
                              &result, 1, &count) == 0 && count == 1) {
            check("D-Bus NameHasOwner", result.kind == GEA_DBUS_BOOLEAN && result.as.b,
                  result.as.b ? "true" : "false");
        } else {
            check("D-Bus NameHasOwner", false, gea_ffi_dbus_last_error());
        }

        gea_ffi_dbus_disconnect(bus);
    } else {
        std::printf("[skip] D-Bus session bus unavailable: %s\n", gea_ffi_dbus_last_error());
    }
#else
    std::printf("[skip] D-Bus support was not compiled in (libdbus headers not found)\n");
#endif

    libc->close();
    delete libc;

    if (failures > 0) {
        std::printf("\n%d check(s) failed\n", failures);
        return 1;
    }
    std::printf("\nsailfish_demo ok\n");
    return 0;
}
