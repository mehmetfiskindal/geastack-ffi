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

static void sendStringReply(DBusConnection* connection, DBusMessage* message, const char* text) {
    DBusMessage* reply = dbus_message_new_method_return(message);
    if (!reply) return;
    DBusMessageIter iter;
    dbus_message_iter_init_append(reply, &iter);
    dbus_message_iter_append_basic(&iter, DBUS_TYPE_STRING, &text);
    dbus_connection_send(connection, reply, nullptr);
    dbus_message_unref(reply);
}

static void sendInt32Reply(DBusConnection* connection, DBusMessage* message, dbus_int32_t value) {
    DBusMessage* reply = dbus_message_new_method_return(message);
    if (!reply) return;
    DBusMessageIter iter;
    dbus_message_iter_init_append(reply, &iter);
    dbus_message_iter_append_basic(&iter, DBUS_TYPE_INT32, &value);
    dbus_connection_send(connection, reply, nullptr);
    dbus_message_unref(reply);
}

static void sendUint32Reply(DBusConnection* connection, DBusMessage* message, dbus_uint32_t value) {
    DBusMessage* reply = dbus_message_new_method_return(message);
    if (!reply) return;
    DBusMessageIter iter;
    dbus_message_iter_init_append(reply, &iter);
    dbus_message_iter_append_basic(&iter, DBUS_TYPE_UINT32, &value);
    dbus_connection_send(connection, reply, nullptr);
    dbus_message_unref(reply);
}

static DBusHandlerResult handleNgfd(DBusConnection* connection, DBusMessage* message, void* userData) {
    (void)userData;
    if (!dbus_message_has_interface(message, "com.nokia.NonGraphicFeedback1")) {
        return DBUS_HANDLER_RESULT_NOT_YET_HANDLED;
    }
    const char* member = dbus_message_get_member(message);

    if (std::strcmp(member, "Play") == 0) {
        DBusMessageIter iter;
        if (!dbus_message_iter_init(message, &iter)
            || dbus_message_iter_get_arg_type(&iter) != DBUS_TYPE_STRING) {
            sendError(connection, message, DBUS_ERROR_INVALID_ARGS, "missing event name");
            return DBUS_HANDLER_RESULT_HANDLED;
        }
        // The second argument is the (possibly empty) a(sv) properties array.
        sendUint32Reply(connection, message, 42);
        return DBUS_HANDLER_RESULT_HANDLED;
    }

    if (std::strcmp(member, "Stop") == 0) {
        dbus_uint32_t eventId = 0;
        if (!dbus_message_get_args(message, nullptr, DBUS_TYPE_UINT32, &eventId, DBUS_TYPE_INVALID)) {
            sendError(connection, message, DBUS_ERROR_INVALID_ARGS, "missing event id");
            return DBUS_HANDLER_RESULT_HANDLED;
        }
        sendUint32Reply(connection, message, eventId);
        return DBUS_HANDLER_RESULT_HANDLED;
    }

    sendError(connection, message, DBUS_ERROR_UNKNOWN_METHOD, "unknown NGFD method");
    return DBUS_HANDLER_RESULT_HANDLED;
}

static DBusHandlerResult handleMceRequest(DBusConnection* connection, DBusMessage* message, void* userData) {
    (void)userData;
    if (!dbus_message_is_method_call(message, "com.nokia.mce.request", dbus_message_get_member(message))) {
        return DBUS_HANDLER_RESULT_NOT_YET_HANDLED;
    }

    const char* member = dbus_message_get_member(message);
    if (std::strcmp(member, "get_display_status") == 0) {
        sendStringReply(connection, message, "dimmed");
        return DBUS_HANDLER_RESULT_HANDLED;
    }
    if (std::strcmp(member, "get_battery_level") == 0) {
        sendInt32Reply(connection, message, 73);
        return DBUS_HANDLER_RESULT_HANDLED;
    }
    if (std::strcmp(member, "get_charger_state") == 0) {
        sendStringReply(connection, message, "on");
        return DBUS_HANDLER_RESULT_HANDLED;
    }
    if (std::strcmp(member, "req_display_blanking_pause") == 0
        || std::strcmp(member, "req_display_cancel_blanking_pause") == 0) {
        sendEmptyReply(connection, message);
        return DBUS_HANDLER_RESULT_HANDLED;
    }
    if (std::strcmp(member, "EmitDisplayStatus") == 0) {
        sendEmptyReply(connection, message);
        DBusMessage* signal = dbus_message_new_signal(
            "/com/nokia/mce/signal", "com.nokia.mce.signal", "display_status_ind");
        if (signal) {
            DBusMessageIter iter;
            dbus_message_iter_init_append(signal, &iter);
            const char* status = "off";
            dbus_message_iter_append_basic(&iter, DBUS_TYPE_STRING, &status);
            dbus_connection_send(connection, signal, nullptr);
            dbus_connection_flush(connection);
            dbus_message_unref(signal);
        }
        return DBUS_HANDLER_RESULT_HANDLED;
    }
    sendError(connection, message, DBUS_ERROR_UNKNOWN_METHOD, "unknown MCE method");
    return DBUS_HANDLER_RESULT_HANDLED;
}

static DBusHandlerResult handleMessage(DBusConnection* connection, DBusMessage* message, void* userData) {
    (void)userData;

    if (dbus_message_is_method_call(message, "com.geastack.GeaFfiTest", "EmitSignal")) {
        sendEmptyReply(connection, message);

        DBusMessage* signal = dbus_message_new_signal(
            "/com/geastack/GeaFfiTest", "com.geastack.GeaFfiTest", "SomethingChanged");
        if (signal) {
            DBusMessageIter root;
            dbus_message_iter_init_append(signal, &root);
            const char* text = "signal-payload";
            dbus_uint32_t number = 99;
            dbus_message_iter_append_basic(&root, DBUS_TYPE_STRING, &text);
            dbus_message_iter_append_basic(&root, DBUS_TYPE_UINT32, &number);
            dbus_connection_send(connection, signal, nullptr);
            dbus_connection_flush(connection);
            dbus_message_unref(signal);
        }
        return DBUS_HANDLER_RESULT_HANDLED;
    }

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

    request = dbus_bus_request_name(connection, "com.nokia.mce",
                                    DBUS_NAME_FLAG_REPLACE_EXISTING, &error);
    if (request != DBUS_REQUEST_NAME_REPLY_PRIMARY_OWNER
        && request != DBUS_REQUEST_NAME_REPLY_ALREADY_OWNER) {
        std::fprintf(stderr, "dbus_test_service: MCE name request failed: %s\n",
                     error.message ? error.message : "unknown error");
        dbus_error_free(&error);
        return 1;
    }

    DBusObjectPathVTable mceVtable{};
    mceVtable.message_function = handleMceRequest;
    if (!dbus_connection_register_object_path(connection, "/com/nokia/mce/request", &mceVtable, nullptr)) {
        std::fprintf(stderr, "dbus_test_service: MCE path registration failed\n");
        return 1;
    }

    request = dbus_bus_request_name(connection, "com.nokia.NonGraphicFeedback1.Backend",
                                    DBUS_NAME_FLAG_REPLACE_EXISTING, &error);
    if (request != DBUS_REQUEST_NAME_REPLY_PRIMARY_OWNER
        && request != DBUS_REQUEST_NAME_REPLY_ALREADY_OWNER) {
        std::fprintf(stderr, "dbus_test_service: NGFD name request failed: %s\n",
                     error.message ? error.message : "unknown error");
        dbus_error_free(&error);
        return 1;
    }

    DBusObjectPathVTable ngfdVtable{};
    ngfdVtable.message_function = handleNgfd;
    if (!dbus_connection_register_object_path(connection, "/com/nokia/NonGraphicFeedback1", &ngfdVtable, nullptr)) {
        std::fprintf(stderr, "dbus_test_service: NGFD path registration failed\n");
        return 1;
    }

    std::puts("dbus_test_service ready");
    std::fflush(stdout);

    while (g_running) {
        dbus_connection_read_write_dispatch(connection, 100);
    }

    dbus_connection_unregister_object_path(connection, "/com/geastack/GeaFfiTest");
    dbus_connection_unregister_object_path(connection, "/com/nokia/mce/request");
    dbus_connection_unregister_object_path(connection, "/com/nokia/NonGraphicFeedback1");
    dbus_connection_unref(connection);
    return 0;
}
