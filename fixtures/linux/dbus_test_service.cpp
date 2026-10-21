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

static DBusHandlerResult handleGetAll(DBusConnection* connection, DBusMessage* message) {
    DBusMessage* reply = dbus_message_new_method_return(message);
    if (!reply) return DBUS_HANDLER_RESULT_HANDLED;
    DBusMessageIter root;
    DBusMessageIter array;
    dbus_message_iter_init_append(reply, &root);
    dbus_message_iter_open_container(&root, DBUS_TYPE_ARRAY, "{sv}", &array);

    const char* key = "TestString";
    const char* text = g_testString.c_str();
    DBusMessageIter entry;
    DBusMessageIter variant;
    dbus_message_iter_open_container(&array, DBUS_TYPE_DICT_ENTRY, nullptr, &entry);
    dbus_message_iter_append_basic(&entry, DBUS_TYPE_STRING, &key);
    dbus_message_iter_open_container(&entry, DBUS_TYPE_VARIANT, "s", &variant);
    dbus_message_iter_append_basic(&variant, DBUS_TYPE_STRING, &text);
    dbus_message_iter_close_container(&entry, &variant);
    dbus_message_iter_close_container(&array, &entry);

    key = "TestUint32";
    dbus_uint32_t number = g_testUint32;
    dbus_message_iter_open_container(&array, DBUS_TYPE_DICT_ENTRY, nullptr, &entry);
    dbus_message_iter_append_basic(&entry, DBUS_TYPE_STRING, &key);
    dbus_message_iter_open_container(&entry, DBUS_TYPE_VARIANT, "u", &variant);
    dbus_message_iter_append_basic(&variant, DBUS_TYPE_UINT32, &number);
    dbus_message_iter_close_container(&entry, &variant);
    dbus_message_iter_close_container(&array, &entry);

    dbus_message_iter_close_container(&root, &array);
    dbus_connection_send(connection, reply, nullptr);
    dbus_message_unref(reply);
    return DBUS_HANDLER_RESULT_HANDLED;
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
        dbus_message_iter_next(&iter);
        if (dbus_message_iter_get_arg_type(&iter) != DBUS_TYPE_ARRAY) {
            sendError(connection, message, DBUS_ERROR_INVALID_ARGS, "missing properties array");
            return DBUS_HANDLER_RESULT_HANDLED;
        }

        bool vibra = false;
        bool volume = false;
        DBusMessageIter array;
        dbus_message_iter_recurse(&iter, &array);
        while (dbus_message_iter_get_arg_type(&array) == DBUS_TYPE_DICT_ENTRY) {
            DBusMessageIter entry;
            dbus_message_iter_recurse(&array, &entry);
            if (dbus_message_iter_get_arg_type(&entry) != DBUS_TYPE_STRING) {
                sendError(connection, message, DBUS_ERROR_INVALID_ARGS, "bad property key");
                return DBUS_HANDLER_RESULT_HANDLED;
            }
            const char* key = "";
            dbus_message_iter_get_basic(&entry, &key);
            dbus_message_iter_next(&entry);
            if (dbus_message_iter_get_arg_type(&entry) != DBUS_TYPE_VARIANT) {
                sendError(connection, message, DBUS_ERROR_INVALID_ARGS, "bad property variant");
                return DBUS_HANDLER_RESULT_HANDLED;
            }
            DBusMessageIter variant;
            dbus_message_iter_recurse(&entry, &variant);
            if (std::strcmp(key, "media.Vibra") == 0
                && dbus_message_iter_get_arg_type(&variant) == DBUS_TYPE_BOOLEAN) {
                dbus_bool_t value = FALSE;
                dbus_message_iter_get_basic(&variant, &value);
                vibra = value ? true : false;
            } else if (std::strcmp(key, "volume") == 0) {
                int type = dbus_message_iter_get_arg_type(&variant);
                if (type == DBUS_TYPE_UINT32) {
                    dbus_uint32_t value = 0;
                    dbus_message_iter_get_basic(&variant, &value);
                    volume = value == 80;
                } else if (type == DBUS_TYPE_INT32) {
                    dbus_int32_t value = 0;
                    dbus_message_iter_get_basic(&variant, &value);
                    volume = value == 80;
                }
            }
            dbus_message_iter_next(&array);
        }

        if (!vibra || !volume) {
            sendError(connection, message, DBUS_ERROR_INVALID_ARGS, "missing expected Play properties");
            return DBUS_HANDLER_RESULT_HANDLED;
        }
        sendUint32Reply(connection, message, 42);

        DBusMessage* signal = dbus_message_new_signal(
            "/com/nokia/NonGraphicFeedback1", "com.nokia.NonGraphicFeedback1", "Status");
        if (signal) {
            DBusMessageIter signalIter;
            dbus_message_iter_init_append(signal, &signalIter);
            dbus_uint32_t id = 42;
            dbus_uint32_t status = 1;
            dbus_message_iter_append_basic(&signalIter, DBUS_TYPE_UINT32, &id);
            dbus_message_iter_append_basic(&signalIter, DBUS_TYPE_UINT32, &status);
            dbus_connection_send(connection, signal, nullptr);
            dbus_connection_flush(connection);
            dbus_message_unref(signal);
        }
        return DBUS_HANDLER_RESULT_HANDLED;
    }

    if (std::strcmp(member, "Pause") == 0) {
        dbus_uint32_t eventId = 0;
        dbus_bool_t paused = FALSE;
        if (!dbus_message_get_args(message, nullptr,
                                   DBUS_TYPE_UINT32, &eventId,
                                   DBUS_TYPE_BOOLEAN, &paused,
                                   DBUS_TYPE_INVALID)) {
            sendError(connection, message, DBUS_ERROR_INVALID_ARGS, "missing Pause arguments");
            return DBUS_HANDLER_RESULT_HANDLED;
        }
        sendUint32Reply(connection, message, eventId);
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

static DBusHandlerResult handleStrings(DBusConnection* connection, DBusMessage* message, void* userData) {
    (void)userData;
    if (!dbus_message_has_interface(message, "com.geastack.GeaFfiStrings")) {
        return DBUS_HANDLER_RESULT_NOT_YET_HANDLED;
    }
    const char* member = dbus_message_get_member(message);
    const bool emitOnly = std::strcmp(member, "EmitStrings") == 0;
    if (std::strcmp(member, "EchoDict") == 0) {
        DBusMessageIter dictIter;
        if (!dbus_message_iter_init(message, &dictIter) || dbus_message_iter_get_arg_type(&dictIter) != DBUS_TYPE_ARRAY) {
            sendError(connection, message, DBUS_ERROR_INVALID_ARGS, "missing dictionary");
            return DBUS_HANDLER_RESULT_HANDLED;
        }
        DBusMessageIter input;
        dbus_message_iter_recurse(&dictIter, &input);
        DBusMessage* reply = dbus_message_new_method_return(message);
        if (!reply) return DBUS_HANDLER_RESULT_HANDLED;
        DBusMessageIter output;
        dbus_message_iter_init_append(reply, &output);
        DBusMessageIter array;
        dbus_message_iter_open_container(&output, DBUS_TYPE_ARRAY, "{sv}", &array);
        while (dbus_message_iter_get_arg_type(&input) == DBUS_TYPE_DICT_ENTRY) {
            DBusMessageIter entry;
            dbus_message_iter_recurse(&input, &entry);
            const char* key = "";
            dbus_message_iter_get_basic(&entry, &key);
            dbus_message_iter_next(&entry);
            DBusMessageIter variant;
            dbus_message_iter_recurse(&entry, &variant);
            const int type = dbus_message_iter_get_arg_type(&variant);
            const char* signature = type == DBUS_TYPE_STRING ? "s"
                : type == DBUS_TYPE_UINT32 ? "u"
                : type == DBUS_TYPE_INT32 ? "i"
                : type == DBUS_TYPE_BOOLEAN ? "b"
                : type == DBUS_TYPE_ARRAY ? "as" : nullptr;
            if (!signature) {
                sendError(connection, message, DBUS_ERROR_INVALID_ARGS, "unsupported dictionary value");
                dbus_message_unref(reply);
                return DBUS_HANDLER_RESULT_HANDLED;
            }
            DBusMessageIter dictEntry;
            DBusMessageIter outVariant;
            dbus_message_iter_open_container(&array, DBUS_TYPE_DICT_ENTRY, nullptr, &dictEntry);
            dbus_message_iter_append_basic(&dictEntry, DBUS_TYPE_STRING, &key);
            dbus_message_iter_open_container(&dictEntry, DBUS_TYPE_VARIANT, signature, &outVariant);
            if (type == DBUS_TYPE_STRING) {
                const char* value = "";
                dbus_message_iter_get_basic(&variant, &value);
                dbus_message_iter_append_basic(&outVariant, DBUS_TYPE_STRING, &value);
            } else if (type == DBUS_TYPE_UINT32) {
                dbus_uint32_t value = 0;
                dbus_message_iter_get_basic(&variant, &value);
                dbus_message_iter_append_basic(&outVariant, DBUS_TYPE_UINT32, &value);
            } else if (type == DBUS_TYPE_INT32) {
                dbus_int32_t value = 0;
                dbus_message_iter_get_basic(&variant, &value);
                dbus_message_iter_append_basic(&outVariant, DBUS_TYPE_INT32, &value);
            } else if (type == DBUS_TYPE_ARRAY) {
                DBusMessageIter inputArray;
                DBusMessageIter outputArray;
                dbus_message_iter_recurse(&variant, &inputArray);
                dbus_message_iter_open_container(&outVariant, DBUS_TYPE_ARRAY, "s", &outputArray);
                while (dbus_message_iter_get_arg_type(&inputArray) == DBUS_TYPE_STRING) {
                    const char* value = "";
                    dbus_message_iter_get_basic(&inputArray, &value);
                    dbus_message_iter_append_basic(&outputArray, DBUS_TYPE_STRING, &value);
                    dbus_message_iter_next(&inputArray);
                }
                dbus_message_iter_close_container(&outVariant, &outputArray);
            } else {
                dbus_bool_t value = FALSE;
                dbus_message_iter_get_basic(&variant, &value);
                dbus_message_iter_append_basic(&outVariant, DBUS_TYPE_BOOLEAN, &value);
            }
            dbus_message_iter_close_container(&dictEntry, &outVariant);
            dbus_message_iter_close_container(&array, &dictEntry);
            dbus_message_iter_next(&input);
        }
        dbus_message_iter_close_container(&output, &array);
        dbus_connection_send(connection, reply, nullptr);
        dbus_message_unref(reply);
        return DBUS_HANDLER_RESULT_HANDLED;
    }
    if (std::strcmp(member, "EchoPaths") == 0) {
        DBusMessageIter pathsIter;
        if (!dbus_message_iter_init(message, &pathsIter) || dbus_message_iter_get_arg_type(&pathsIter) != DBUS_TYPE_ARRAY) {
            sendError(connection, message, DBUS_ERROR_INVALID_ARGS, "missing object path array");
            return DBUS_HANDLER_RESULT_HANDLED;
        }
        DBusMessageIter input;
        dbus_message_iter_recurse(&pathsIter, &input);
        DBusMessage* reply = dbus_message_new_method_return(message);
        if (!reply) return DBUS_HANDLER_RESULT_HANDLED;
        DBusMessageIter output;
        dbus_message_iter_init_append(reply, &output);
        DBusMessageIter array;
        dbus_message_iter_open_container(&output, DBUS_TYPE_ARRAY, "o", &array);
        while (dbus_message_iter_get_arg_type(&input) == DBUS_TYPE_OBJECT_PATH) {
            const char* value = "";
            dbus_message_iter_get_basic(&input, &value);
            dbus_message_iter_append_basic(&array, DBUS_TYPE_OBJECT_PATH, &value);
            dbus_message_iter_next(&input);
        }
        dbus_message_iter_close_container(&output, &array);
        dbus_connection_send(connection, reply, nullptr);
        dbus_message_unref(reply);
        return DBUS_HANDLER_RESULT_HANDLED;
    }
    if (std::strcmp(member, "EchoBytes") == 0) {
        DBusMessageIter bytesIter;
        if (!dbus_message_iter_init(message, &bytesIter) || dbus_message_iter_get_arg_type(&bytesIter) != DBUS_TYPE_ARRAY) {
            sendError(connection, message, DBUS_ERROR_INVALID_ARGS, "missing byte array");
            return DBUS_HANDLER_RESULT_HANDLED;
        }
        DBusMessageIter input;
        dbus_message_iter_recurse(&bytesIter, &input);
        DBusMessage* reply = dbus_message_new_method_return(message);
        if (!reply) return DBUS_HANDLER_RESULT_HANDLED;
        DBusMessageIter output;
        dbus_message_iter_init_append(reply, &output);
        DBusMessageIter array;
        dbus_message_iter_open_container(&output, DBUS_TYPE_ARRAY, "y", &array);
        while (dbus_message_iter_get_arg_type(&input) == DBUS_TYPE_BYTE) {
            uint8_t byte = 0;
            dbus_message_iter_get_basic(&input, &byte);
            dbus_message_iter_append_basic(&array, DBUS_TYPE_BYTE, &byte);
            dbus_message_iter_next(&input);
        }
        dbus_message_iter_close_container(&output, &array);
        dbus_connection_send(connection, reply, nullptr);
        dbus_message_unref(reply);
        return DBUS_HANDLER_RESULT_HANDLED;
    }
    if (std::strcmp(member, "EchoStrings") != 0 && !emitOnly) {
        sendError(connection, message, DBUS_ERROR_UNKNOWN_METHOD, "unknown strings method");
        return DBUS_HANDLER_RESULT_HANDLED;
    }

    DBusMessageIter iter;
    if (!dbus_message_iter_init(message, &iter) || dbus_message_iter_get_arg_type(&iter) != DBUS_TYPE_ARRAY) {
        sendError(connection, message, DBUS_ERROR_INVALID_ARGS, "missing string array");
        return DBUS_HANDLER_RESULT_HANDLED;
    }
    DBusMessageIter input;
    dbus_message_iter_recurse(&iter, &input);

    if (emitOnly) {
        DBusMessage* signal = dbus_message_new_signal(
            "/com/geastack/GeaFfiStrings", "com.geastack.GeaFfiStrings", "Strings");
        if (!signal) {
            sendError(connection, message, DBUS_ERROR_NO_MEMORY, "could not allocate signal");
            return DBUS_HANDLER_RESULT_HANDLED;
        }
        DBusMessageIter signalIter;
        dbus_message_iter_init_append(signal, &signalIter);
        DBusMessageIter signalArray;
        dbus_message_iter_open_container(&signalIter, DBUS_TYPE_ARRAY, "s", &signalArray);
        while (dbus_message_iter_get_arg_type(&input) == DBUS_TYPE_STRING) {
            const char* value = "";
            dbus_message_iter_get_basic(&input, &value);
            dbus_message_iter_append_basic(&signalArray, DBUS_TYPE_STRING, &value);
            dbus_message_iter_next(&input);
        }
        dbus_message_iter_close_container(&signalIter, &signalArray);
        dbus_connection_send(connection, signal, nullptr);
        dbus_connection_flush(connection);
        dbus_message_unref(signal);

        DBusMessage* emptyReply = dbus_message_new_method_return(message);
        if (emptyReply) {
            dbus_connection_send(connection, emptyReply, nullptr);
            dbus_message_unref(emptyReply);
        }
        return DBUS_HANDLER_RESULT_HANDLED;
    }

    DBusMessage* reply = dbus_message_new_method_return(message);
    if (!reply) return DBUS_HANDLER_RESULT_HANDLED;
    DBusMessageIter output;
    dbus_message_iter_init_append(reply, &output);
    DBusMessageIter array;
    dbus_message_iter_open_container(&output, DBUS_TYPE_ARRAY, "s", &array);
    while (dbus_message_iter_get_arg_type(&input) == DBUS_TYPE_STRING) {
        const char* value = "";
        dbus_message_iter_get_basic(&input, &value);
        dbus_message_iter_append_basic(&array, DBUS_TYPE_STRING, &value);
        dbus_message_iter_next(&input);
    }
    dbus_message_iter_close_container(&output, &array);
    dbus_connection_send(connection, reply, nullptr);
    dbus_message_unref(reply);
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
    if (dbus_message_is_method_call(message, "org.freedesktop.DBus.Properties", "GetAll")) {
        return handleGetAll(connection, message);
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

    request = dbus_bus_request_name(connection, "com.geastack.GeaFfiStrings",
                                    DBUS_NAME_FLAG_REPLACE_EXISTING, &error);
    if (request != DBUS_REQUEST_NAME_REPLY_PRIMARY_OWNER
        && request != DBUS_REQUEST_NAME_REPLY_ALREADY_OWNER) {
        std::fprintf(stderr, "dbus_test_service: strings name request failed: %s\n",
                     error.message ? error.message : "unknown error");
        dbus_error_free(&error);
        return 1;
    }

    DBusObjectPathVTable stringsVtable{};
    stringsVtable.message_function = handleStrings;
    if (!dbus_connection_register_object_path(connection, "/com/geastack/GeaFfiStrings", &stringsVtable, nullptr)) {
        std::fprintf(stderr, "dbus_test_service: strings path registration failed\n");
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
    dbus_connection_unregister_object_path(connection, "/com/geastack/GeaFfiStrings");
    dbus_connection_unref(connection);
    return 0;
}
