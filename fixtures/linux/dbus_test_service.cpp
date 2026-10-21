// SPDX-License-Identifier: Apache-2.0
/*
 * Minimal libdbus test service for the TypeScript D-Bus tests.
 * Exposes /com/geastack/GeaFfiTest with two org.freedesktop.DBus.Properties
 * values and supports both Get and Set.
 */
#include <dbus/dbus.h>

#include <cstdio>
#include <cstring>
#include <string>

static bool g_running = true;
static std::string g_testString = "hello-from-service";
static dbus_uint32_t g_testUint32 = 4242;

static void sendError(DBusConnection* connection, DBusMessage* message, const char* name, const char* text) {
    DBusMessage* error = dbus_message_new_error(message, name, text);
    if (error) {
        dbus_connection_send(connection, error, nullptr);
        dbus_message_unref(error);
    }
}

static void sendEmptyReply(DBusConnection* connection, DBusMessage* message) {
    DBusMessage* reply = dbus_message_new_method_return(message);
    if (reply) {
        dbus_connection_send(connection, reply, nullptr);
        dbus_message_unref(reply);
    }
}

static bool readStringArgument(DBusMessageIter* iter, const char** value) {
    if (dbus_message_iter_get_arg_type(iter) != DBUS_TYPE_STRING) return false;
    dbus_message_iter_get_basic(iter, value);
    return true;
}

static DBusHandlerResult handleGet(DBusConnection* connection, DBusMessage* message) {
    DBusMessageIter iter;
    const char* interfaceName = nullptr;
    const char* propertyName = nullptr;
    if (!dbus_message_iter_init(message, &iter)
        || !readStringArgument(&iter, &interfaceName)
        || !dbus_message_iter_next(&iter)
        || !readStringArgument(&iter, &propertyName)) {
        sendError(connection, message, DBUS_ERROR_INVALID_ARGS, "missing interface or property name");
        return DBUS_HANDLER_RESULT_HANDLED;
    }

    DBusMessage* reply = dbus_message_new_method_return(message);
    if (!reply) {
        sendError(connection, message, DBUS_ERROR_NO_MEMORY, "out of memory");
        return DBUS_HANDLER_RESULT_HANDLED;
    }

    DBusMessageIter root;
    DBusMessageIter variant;
    dbus_message_iter_init_append(reply, &root);

    if (std::strcmp(propertyName, "TestString") == 0) {
        const char* text = g_testString.c_str();
        dbus_message_iter_open_container(&root, DBUS_TYPE_VARIANT, "s", &variant);
        dbus_message_iter_append_basic(&variant, DBUS_TYPE_STRING, &text);
        dbus_message_iter_close_container(&root, &variant);
    } else if (std::strcmp(propertyName, "TestUint32") == 0) {
        dbus_uint32_t value = g_testUint32;
        dbus_message_iter_open_container(&root, DBUS_TYPE_VARIANT, "u", &variant);
        dbus_message_iter_append_basic(&variant, DBUS_TYPE_UINT32, &value);
        dbus_message_iter_close_container(&root, &variant);
    } else if (std::strcmp(propertyName, "Stop") == 0) {
        g_running = false;
        const char* text = "stopping";
        dbus_message_iter_open_container(&root, DBUS_TYPE_VARIANT, "s", &variant);
        dbus_message_iter_append_basic(&variant, DBUS_TYPE_STRING, &text);
        dbus_message_iter_close_container(&root, &variant);
    } else {
        dbus_message_unref(reply);
        sendError(connection, message, DBUS_ERROR_UNKNOWN_PROPERTY, "no such property");
        return DBUS_HANDLER_RESULT_HANDLED;
    }

    dbus_connection_send(connection, reply, nullptr);
    dbus_message_unref(reply);
    return DBUS_HANDLER_RESULT_HANDLED;
}

static DBusHandlerResult handleSet(DBusConnection* connection, DBusMessage* message) {
    DBusMessageIter iter;
    const char* interfaceName = nullptr;
    const char* propertyName = nullptr;
    if (!dbus_message_iter_init(message, &iter)
        || !readStringArgument(&iter, &interfaceName)
        || !dbus_message_iter_next(&iter)
        || !readStringArgument(&iter, &propertyName)) {
        sendError(connection, message, DBUS_ERROR_INVALID_ARGS, "missing interface or property name");
        return DBUS_HANDLER_RESULT_HANDLED;
    }

    if (!dbus_message_iter_next(&iter) || dbus_message_iter_get_arg_type(&iter) != DBUS_TYPE_VARIANT) {
        sendError(connection, message, DBUS_ERROR_INVALID_ARGS, "missing variant value");
        return DBUS_HANDLER_RESULT_HANDLED;
    }

    DBusMessageIter variant;
    dbus_message_iter_recurse(&iter, &variant);
    int type = dbus_message_iter_get_arg_type(&variant);

    if (std::strcmp(propertyName, "TestString") == 0 && type == DBUS_TYPE_STRING) {
        const char* value = "";
        dbus_message_iter_get_basic(&variant, &value);
        g_testString = value ? value : "";
    } else if (std::strcmp(propertyName, "TestUint32") == 0 && type == DBUS_TYPE_UINT32) {
        dbus_uint32_t value = 0;
        dbus_message_iter_get_basic(&variant, &value);
        g_testUint32 = value;
    } else if (std::strcmp(propertyName, "TestUint32") == 0 && type == DBUS_TYPE_INT32) {
        dbus_int32_t value = 0;
        dbus_message_iter_get_basic(&variant, &value);
        g_testUint32 = static_cast<dbus_uint32_t>(value);
    } else {
        sendError(connection, message, DBUS_ERROR_INVALID_ARGS, "unsupported property value");
        return DBUS_HANDLER_RESULT_HANDLED;
    }

    sendEmptyReply(connection, message);
    return DBUS_HANDLER_RESULT_HANDLED;
}

static DBusHandlerResult handleMessage(DBusConnection* connection, DBusMessage* message, void* userData) {
    (void)userData;

    if (dbus_message_is_method_call(message, "org.freedesktop.DBus.Peer", "Ping")) {
        sendEmptyReply(connection, message);
        return DBUS_HANDLER_RESULT_HANDLED;
    }
    if (dbus_message_is_method_call(message, "org.freedesktop.DBus.Properties", "Get")) {
        return handleGet(connection, message);
    }
    if (dbus_message_is_method_call(message, "org.freedesktop.DBus.Properties", "Set")) {
        return handleSet(connection, message);
    }
    return DBUS_HANDLER_RESULT_NOT_YET_HANDLED;
}

int main() {
    DBusError error;
    dbus_error_init(&error);
    DBusConnection* connection = dbus_bus_get(DBUS_BUS_SESSION, &error);
    if (!connection) {
        std::fprintf(stderr, "dbus_test_service: %s\n", error.message ? error.message : "no session bus");
        dbus_error_free(&error);
        return 1;
    }
    dbus_connection_set_exit_on_disconnect(connection, FALSE);

    int request = dbus_bus_request_name(connection, "com.geastack.GeaFfiTest",
                                        DBUS_NAME_FLAG_REPLACE_EXISTING, &error);
    if (request != DBUS_REQUEST_NAME_REPLY_PRIMARY_OWNER
        && request != DBUS_REQUEST_NAME_REPLY_ALREADY_OWNER) {
        std::fprintf(stderr, "dbus_test_service: name request failed: %s\n",
                     error.message ? error.message : "unknown error");
        dbus_error_free(&error);
        return 1;
    }

    DBusObjectPathVTable vtable{};
    vtable.message_function = handleMessage;
    if (!dbus_connection_register_object_path(connection, "/com/geastack/GeaFfiTest", &vtable, nullptr)) {
        std::fprintf(stderr, "dbus_test_service: object path registration failed\n");
        return 1;
    }

    std::puts("dbus_test_service ready");
    std::fflush(stdout);

    while (g_running) {
        dbus_connection_read_write_dispatch(connection, 100);
    }

    dbus_connection_unregister_object_path(connection, "/com/geastack/GeaFfiTest");
    dbus_connection_unref(connection);
    return 0;
}
