// SPDX-License-Identifier: Apache-2.0
/*
 * Host test for the libdbus bridge. Run under `dbus-run-session` so a private
 * session bus is available.
 */
#include "gea/ffi/gea_ffi_dbus.h"

#include <cstdio>
#include <cstring>

static int fail(const char* message) {
    std::fprintf(stderr, "dbus_test: %s (last_error=%s)\n", message, gea_ffi_dbus_last_error());
    return 1;
}

static GeaDbusValue stringValue(const char* value) {
    GeaDbusValue result{};
    result.kind = GEA_DBUS_STRING;
    result.as.str = value;
    return result;
}

static void releaseValue(GeaDbusValue& value) {
    if (value.kind == GEA_DBUS_STRING || value.kind == GEA_DBUS_OBJECT_PATH) {
        gea_ffi_dbus_free(const_cast<char*>(value.as.str));
        value.as.str = nullptr;
    }
}

int main() {
    void* connection = nullptr;
    if (gea_ffi_dbus_connect(0, &connection) != 0) return fail("session bus connect failed");
    if (!connection) return fail("session bus returned a null connection");

    const char* uniqueName = gea_ffi_dbus_unique_name(connection);
    if (!uniqueName || uniqueName[0] != ':') return fail("connection has no unique name");

    GeaDbusValue argument = stringValue("org.freedesktop.DBus");
    GeaDbusValue result{};
    int32_t count = 0;

    // NameHasOwner(s) -> b
    if (gea_ffi_dbus_call(connection, "org.freedesktop.DBus", "/org/freedesktop/DBus",
                          "org.freedesktop.DBus", "NameHasOwner", &argument, 1,
                          &result, 1, &count) != 0) {
        return fail("NameHasOwner failed");
    }
    if (count != 1 || result.kind != GEA_DBUS_BOOLEAN || !result.as.b) {
        return fail("NameHasOwner returned the wrong value");
    }

    // GetNameOwner(s) -> s
    if (gea_ffi_dbus_call(connection, "org.freedesktop.DBus", "/org/freedesktop/DBus",
                          "org.freedesktop.DBus", "GetNameOwner", &argument, 1,
                          &result, 1, &count) != 0) {
        return fail("GetNameOwner failed");
    }
    if (count != 1 || result.kind != GEA_DBUS_STRING || std::strlen(result.as.str) == 0) {
        return fail("GetNameOwner returned the wrong value");
    }
    releaseValue(result);

    // GetConnectionUnixProcessID(s) -> u
    if (gea_ffi_dbus_call(connection, "org.freedesktop.DBus", "/org/freedesktop/DBus",
                          "org.freedesktop.DBus", "GetConnectionUnixProcessID", &argument, 1,
                          &result, 1, &count) != 0) {
        return fail("GetConnectionUnixProcessID failed");
    }
    if (count != 1 || result.kind != GEA_DBUS_UINT32 || result.as.u32 == 0) {
        return fail("GetConnectionUnixProcessID returned the wrong value");
    }

    // GetId() -> s, through the explicit-timeout entry point.
    if (gea_ffi_dbus_call_timeout(connection, "org.freedesktop.DBus", "/org/freedesktop/DBus",
                                  "org.freedesktop.DBus", "GetId", nullptr, 0,
                                  &result, 1, &count, 5000) != 0) {
        return fail("GetId failed");
    }
    if (count != 1 || result.kind != GEA_DBUS_STRING || std::strlen(result.as.str) == 0) {
        return fail("GetId returned the wrong value");
    }
    releaseValue(result);

    // Missing methods and unknown services surface a libdbus error.
    if (gea_ffi_dbus_call(connection, "org.freedesktop.DBus", "/org/freedesktop/DBus",
                          "org.freedesktop.DBus", "NoSuchMethod", nullptr, 0,
                          &result, 1, &count) == 0) {
        return fail("missing method succeeded");
    }
    if (std::strlen(gea_ffi_dbus_last_error()) == 0) return fail("missing method did not set an error");

    GeaDbusValue ghost = stringValue("com.example.GeaFfiNoSuchService");
    if (gea_ffi_dbus_call(connection, "org.freedesktop.DBus", "/org/freedesktop/DBus",
                          "org.freedesktop.DBus", "GetNameOwner", &ghost, 1,
                          &result, 1, &count) == 0) {
        return fail("unknown service resolved");
    }
    if (std::strlen(gea_ffi_dbus_last_error()) == 0) return fail("unknown service did not set an error");

    // A well-formed call still works after those errors.
    if (gea_ffi_dbus_call(connection, "org.freedesktop.DBus", "/org/freedesktop/DBus",
                          "org.freedesktop.DBus", "NameHasOwner", &argument, 1,
                          &result, 1, &count) != 0) {
        return fail("call after error failed");
    }
    if (count != 1 || !result.as.b) return fail("call after error returned the wrong value");

    gea_ffi_dbus_disconnect(connection);
    std::puts("dbus_test ok");
    return 0;
}
