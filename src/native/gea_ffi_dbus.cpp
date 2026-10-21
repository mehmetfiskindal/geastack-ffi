// SPDX-License-Identifier: Apache-2.0
#if defined(__has_include)
#if __has_include(<dbus/dbus.h>)
#define GEA_FFI_DBUS_AVAILABLE 1
#endif
#endif

#if defined(GEA_FFI_DBUS_AVAILABLE)

#include "gea/ffi/gea_ffi_dbus.h"

#include <dbus/dbus.h>

#include <cstdarg>
#include <cstdio>
#include <cstdlib>
#include <cstring>

namespace {

thread_local char g_last_error[512] = {0};
bool g_threads_initialized = false;

void setError(const char* format, ...) {
    va_list args;
    va_start(args, format);
    std::vsnprintf(g_last_error, sizeof(g_last_error), format, args);
    va_end(args);
}

void clearError() {
    g_last_error[0] = '\0';
}

void setDbusError(DBusError& error, const char* fallback) {
    if (dbus_error_is_set(&error) && error.message) {
        setError("%s", error.message);
    } else {
        setError("%s", fallback);
    }
    dbus_error_free(&error);
}

int basicTypeFor(int32_t kind) {
    switch (kind) {
        case GEA_DBUS_STRING: return DBUS_TYPE_STRING;
        case GEA_DBUS_OBJECT_PATH: return DBUS_TYPE_OBJECT_PATH;
        case GEA_DBUS_BOOLEAN: return DBUS_TYPE_BOOLEAN;
        case GEA_DBUS_INT32: return DBUS_TYPE_INT32;
        case GEA_DBUS_UINT32: return DBUS_TYPE_UINT32;
        case GEA_DBUS_INT64: return DBUS_TYPE_INT64;
        case GEA_DBUS_UINT64: return DBUS_TYPE_UINT64;
        case GEA_DBUS_DOUBLE: return DBUS_TYPE_DOUBLE;
        default: return DBUS_TYPE_INVALID;
    }
}

int32_t appendBasicValue(DBusMessageIter* iter, const GeaDbusValue& value) {
    if (value.kind == GEA_DBUS_EMPTY_ARRAY) {
        const char* elementSignature = value.as.str ? value.as.str : "";
        DBusMessageIter array;
        if (!dbus_message_iter_open_container(iter, DBUS_TYPE_ARRAY, elementSignature, &array)
            || !dbus_message_iter_close_container(iter, &array)) {
            setError("could not append an empty D-Bus array");
            return -2;
        }
        return 0;
    }

    int type = basicTypeFor(value.kind);
    if (type == DBUS_TYPE_INVALID) {
        setError("unsupported D-Bus argument kind %d", value.kind);
        return -4;
    }

    dbus_bool_t ok = FALSE;
    if (value.kind == GEA_DBUS_STRING || value.kind == GEA_DBUS_OBJECT_PATH) {
        const char* text = value.as.str ? value.as.str : "";
        ok = dbus_message_iter_append_basic(iter, type, &text);
    } else if (value.kind == GEA_DBUS_BOOLEAN) {
        dbus_bool_t flag = value.as.b ? TRUE : FALSE;
        ok = dbus_message_iter_append_basic(iter, type, &flag);
    } else if (value.kind == GEA_DBUS_INT32) {
        dbus_int32_t number = value.as.i32;
        ok = dbus_message_iter_append_basic(iter, type, &number);
    } else if (value.kind == GEA_DBUS_UINT32) {
        dbus_uint32_t number = value.as.u32;
        ok = dbus_message_iter_append_basic(iter, type, &number);
    } else if (value.kind == GEA_DBUS_INT64) {
        dbus_int64_t number = value.as.i64;
        ok = dbus_message_iter_append_basic(iter, type, &number);
    } else if (value.kind == GEA_DBUS_UINT64) {
        dbus_uint64_t number = value.as.u64;
        ok = dbus_message_iter_append_basic(iter, type, &number);
    } else if (value.kind == GEA_DBUS_DOUBLE) {
        double number = value.as.d;
        ok = dbus_message_iter_append_basic(iter, type, &number);
    }

    if (!ok) {
        setError("could not append a D-Bus value");
        return -2;
    }
    return 0;
}

void copyString(char* out, int32_t capacity, const char* value) {
    if (!out || capacity <= 0) return;
    std::snprintf(out, static_cast<size_t>(capacity), "%s", value ? value : "");
}

const char* signatureForKind(int32_t kind) {
    switch (kind) {
        case GEA_DBUS_STRING: return "s";
        case GEA_DBUS_OBJECT_PATH: return "o";
        case GEA_DBUS_BOOLEAN: return "b";
        case GEA_DBUS_INT32: return "i";
        case GEA_DBUS_UINT32: return "u";
        case GEA_DBUS_INT64: return "x";
        case GEA_DBUS_UINT64: return "t";
        case GEA_DBUS_DOUBLE: return "d";
        default: return nullptr;
    }
}

int32_t appendArguments(DBusMessage* message, const GeaDbusValue* args, int32_t argc) {
    DBusMessageIter iter;
    dbus_message_iter_init_append(message, &iter);
    for (int32_t i = 0; i < argc; ++i) {
        int32_t status = appendBasicValue(&iter, args[i]);
        if (status != 0) {
            setError("could not append D-Bus argument %d", i);
            return status;
        }
    }
    return 0;
}

int32_t readBasicValue(DBusMessageIter* iter, GeaDbusValue& result) {
    int type = dbus_message_iter_get_arg_type(iter);
    if (type == DBUS_TYPE_VARIANT) {
        DBusMessageIter variant;
        dbus_message_iter_recurse(iter, &variant);
        return readBasicValue(&variant, result);
    }

    if (type == DBUS_TYPE_STRING || type == DBUS_TYPE_OBJECT_PATH) {
        const char* text = nullptr;
        dbus_message_iter_get_basic(iter, &text);
        result.kind = (type == DBUS_TYPE_STRING) ? GEA_DBUS_STRING : GEA_DBUS_OBJECT_PATH;
        result.as.str = text ? ::strdup(text) : ::strdup("");
        if (!result.as.str) {
            setError("out of memory copying a D-Bus reply string");
            return -2;
        }
    } else if (type == DBUS_TYPE_BOOLEAN) {
        dbus_bool_t flag = FALSE;
        dbus_message_iter_get_basic(iter, &flag);
        result.kind = GEA_DBUS_BOOLEAN;
        result.as.b = flag ? 1 : 0;
    } else if (type == DBUS_TYPE_INT32) {
        dbus_int32_t number = 0;
        dbus_message_iter_get_basic(iter, &number);
        result.kind = GEA_DBUS_INT32;
        result.as.i32 = number;
    } else if (type == DBUS_TYPE_UINT32) {
        dbus_uint32_t number = 0;
        dbus_message_iter_get_basic(iter, &number);
        result.kind = GEA_DBUS_UINT32;
        result.as.u32 = number;
    } else if (type == DBUS_TYPE_INT64) {
        dbus_int64_t number = 0;
        dbus_message_iter_get_basic(iter, &number);
        result.kind = GEA_DBUS_INT64;
        result.as.i64 = number;
    } else if (type == DBUS_TYPE_UINT64) {
        dbus_uint64_t number = 0;
        dbus_message_iter_get_basic(iter, &number);
        result.kind = GEA_DBUS_UINT64;
        result.as.u64 = number;
    } else if (type == DBUS_TYPE_DOUBLE) {
        double number = 0;
        dbus_message_iter_get_basic(iter, &number);
        result.kind = GEA_DBUS_DOUBLE;
        result.as.d = number;
    } else {
        setError("unsupported D-Bus reply type '%c'", type);
        return -4;
    }
    return 0;
}

int32_t readReply(DBusMessage* reply, GeaDbusValue* results, int32_t capacity, int32_t* count) {
    DBusMessageIter iter;
    if (!dbus_message_iter_init(reply, &iter)) {
        *count = 0;
        return 0;
    }

    int32_t index = 0;
    do {
        if (index >= capacity) {
            setError("D-Bus reply has more values than the result capacity (%d)", capacity);
            return -4;
        }
        int32_t status = readBasicValue(&iter, results[index]);
        if (status != 0) return status;
        ++index;
    } while (dbus_message_iter_next(&iter));

    *count = index;
    return 0;
}

int32_t callMethod(void* connection,
                   const char* service,
                   const char* object_path,
                   const char* interface_name,
                   const char* method,
                   const GeaDbusValue* args, int32_t argc,
                   GeaDbusValue* results, int32_t result_capacity,
                   int32_t* result_count,
                   int32_t timeout_ms) {
    clearError();
    if (!connection || !service || !object_path || !interface_name || !method) {
        setError("D-Bus call received a null connection, service, path, interface, or method");
        return -1;
    }
    if (argc < 0 || (argc > 0 && !args)) {
        setError("invalid D-Bus argument list");
        return -4;
    }
    if (!result_count || result_capacity < 0 || (result_capacity > 0 && !results)) {
        setError("invalid D-Bus result buffer");
        return -4;
    }

    DBusError error;
    dbus_error_init(&error);

    DBusMessage* message = dbus_message_new_method_call(service, object_path, interface_name, method);
    if (!message) {
        setError("could not allocate a D-Bus method message");
        return -2;
    }

    int32_t status = appendArguments(message, args, argc);
    if (status != 0) {
        dbus_message_unref(message);
        return status;
    }

    DBusMessage* reply = dbus_connection_send_with_reply_and_block(
        static_cast<DBusConnection*>(connection), message, timeout_ms, &error);
    dbus_message_unref(message);
    if (!reply) {
        setDbusError(error, "D-Bus call failed");
        return -3;
    }

    status = readReply(reply, results, result_capacity, result_count);
    dbus_message_unref(reply);
    return status;
}

} // namespace

extern "C" {

int32_t gea_ffi_dbus_connect(int32_t bus_type, void** connection) {
    clearError();
    if (!connection) {
        setError("connection output pointer is null");
        return -1;
    }
    *connection = nullptr;
    if (!g_threads_initialized) {
        dbus_threads_init_default();
        g_threads_initialized = true;
    }

    DBusBusType type = bus_type == 1 ? DBUS_BUS_SYSTEM : DBUS_BUS_SESSION;
    DBusError error;
    dbus_error_init(&error);
    DBusConnection* conn = dbus_bus_get_private(type, &error);
    if (!conn) {
        setDbusError(error, "could not connect to the D-Bus bus");
        return -3;
    }
    dbus_connection_set_exit_on_disconnect(conn, FALSE);
    *connection = conn;
    return 0;
}

void gea_ffi_dbus_disconnect(void* connection) {
    if (!connection) return;
    DBusConnection* conn = static_cast<DBusConnection*>(connection);
    dbus_connection_close(conn);
    dbus_connection_unref(conn);
}

const char* gea_ffi_dbus_unique_name(void* connection) {
    clearError();
    if (!connection) return "";
    const char* name = dbus_bus_get_unique_name(static_cast<DBusConnection*>(connection));
    return name ? name : "";
}

int32_t gea_ffi_dbus_call(void* connection,
                          const char* service,
                          const char* object_path,
                          const char* interface_name,
                          const char* method,
                          const GeaDbusValue* args, int32_t argc,
                          GeaDbusValue* results, int32_t result_capacity,
                          int32_t* result_count) {
    return callMethod(connection, service, object_path, interface_name, method,
                      args, argc, results, result_capacity, result_count, 25000);
}

int32_t gea_ffi_dbus_call_timeout(void* connection,
                                  const char* service,
                                  const char* object_path,
                                  const char* interface_name,
                                  const char* method,
                                  const GeaDbusValue* args, int32_t argc,
                                  GeaDbusValue* results, int32_t result_capacity,
                                  int32_t* result_count,
                                  int32_t timeout_ms) {
    return callMethod(connection, service, object_path, interface_name, method,
                      args, argc, results, result_capacity, result_count, timeout_ms);
}

int32_t gea_ffi_dbus_set_property(void* connection,
                                  const char* service,
                                  const char* object_path,
                                  const char* interface_name,
                                  const char* property_name,
                                  const GeaDbusValue* value) {
    clearError();
    if (!connection || !service || !object_path || !interface_name || !property_name || !value) {
        setError("D-Bus SetProperty received a null argument");
        return -1;
    }
    const char* signature = signatureForKind(value->kind);
    if (!signature) {
        setError("unsupported D-Bus property kind %d", value->kind);
        return -4;
    }

    DBusError error;
    dbus_error_init(&error);
    DBusMessage* message = dbus_message_new_method_call(
        service, object_path, "org.freedesktop.DBus.Properties", "Set");
    if (!message) {
        setError("could not allocate a D-Bus Set message");
        return -2;
    }

    DBusMessageIter root;
    DBusMessageIter variant;
    dbus_message_iter_init_append(message, &root);
    if (!dbus_message_iter_append_basic(&root, DBUS_TYPE_STRING, &interface_name)
        || !dbus_message_iter_append_basic(&root, DBUS_TYPE_STRING, &property_name)
        || !dbus_message_iter_open_container(&root, DBUS_TYPE_VARIANT, signature, &variant)) {
        dbus_message_unref(message);
        setError("could not build the D-Bus Set message");
        return -2;
    }
    int32_t status = appendBasicValue(&variant, *value);
    dbus_message_iter_close_container(&root, &variant);
    if (status != 0) {
        dbus_message_unref(message);
        return status;
    }

    DBusMessage* reply = dbus_connection_send_with_reply_and_block(
        static_cast<DBusConnection*>(connection), message, 25000, &error);
    dbus_message_unref(message);
    if (!reply) {
        setDbusError(error, "D-Bus SetProperty failed");
        return -3;
    }
    if (dbus_message_get_type(reply) == DBUS_MESSAGE_TYPE_ERROR) {
        const char* name = dbus_message_get_error_name(reply);
        setError("D-Bus SetProperty failed: %s", name ? name : "unknown error");
        dbus_message_unref(reply);
        return -3;
    }
    dbus_message_unref(reply);
    return 0;
}

int32_t gea_ffi_dbus_add_match(void* connection, const char* rule) {
    clearError();
    if (!connection || !rule) {
        setError("D-Bus AddMatch received a null connection or rule");
        return -1;
    }
    DBusError error;
    dbus_error_init(&error);
    dbus_bus_add_match(static_cast<DBusConnection*>(connection), rule, &error);
    if (dbus_error_is_set(&error)) {
        setDbusError(error, "D-Bus AddMatch failed");
        return -3;
    }
    return 0;
}

int32_t gea_ffi_dbus_remove_match(void* connection, const char* rule) {
    clearError();
    if (!connection || !rule) {
        setError("D-Bus RemoveMatch received a null connection or rule");
        return -1;
    }
    DBusError error;
    dbus_error_init(&error);
    dbus_bus_remove_match(static_cast<DBusConnection*>(connection), rule, &error);
    if (dbus_error_is_set(&error)) {
        setDbusError(error, "D-Bus RemoveMatch failed");
        return -3;
    }
    return 0;
}

int32_t gea_ffi_dbus_next_signal(void* connection, int32_t timeout_ms,
                                 char* interface_out, int32_t interface_capacity,
                                 char* member_out, int32_t member_capacity,
                                 char* path_out, int32_t path_capacity,
                                 GeaDbusValue* values, int32_t value_capacity,
                                 int32_t* value_count) {
    clearError();
    if (!connection || !value_count) {
        setError("D-Bus NextSignal received a null connection or count");
        return -1;
    }
    if (timeout_ms < 0) timeout_ms = 0;
    if (value_capacity < 0 || (value_capacity > 0 && !values)) {
        setError("invalid D-Bus signal value buffer");
        return -4;
    }
    *value_count = 0;

    DBusConnection* conn = static_cast<DBusConnection*>(connection);
    if (!dbus_connection_read_write(conn, timeout_ms)) {
        setError("D-Bus connection closed while waiting for a signal");
        return -3;
    }

    DBusMessage* message = nullptr;
    while ((message = dbus_connection_pop_message(conn)) != nullptr) {
        if (dbus_message_get_type(message) == DBUS_MESSAGE_TYPE_SIGNAL) break;
        dbus_message_unref(message);
        message = nullptr;
    }
    if (!message) return 0;

    copyString(interface_out, interface_capacity, dbus_message_get_interface(message));
    copyString(member_out, member_capacity, dbus_message_get_member(message));
    copyString(path_out, path_capacity, dbus_message_get_path(message));

    DBusMessageIter iter;
    int32_t count = 0;
    if (dbus_message_iter_init(message, &iter)) {
        do {
            if (count >= value_capacity) {
                setError("D-Bus signal has more values than the result capacity (%d)", value_capacity);
                dbus_message_unref(message);
                return -4;
            }
            int32_t status = readBasicValue(&iter, values[count]);
            if (status != 0) {
                dbus_message_unref(message);
                return status;
            }
            ++count;
        } while (dbus_message_iter_next(&iter));
    }

    dbus_message_unref(message);
    *value_count = count;
    return 1;
}

int32_t gea_ffi_dbus_call_string_properties_uint(void* connection,
                                                 const char* service,
                                                 const char* object_path,
                                                 const char* interface_name,
                                                 const char* method,
                                                 const char* first_argument,
                                                 const GeaDbusProperty* properties,
                                                 int32_t property_count,
                                                 uint32_t* result) {
    clearError();
    if (!connection || !service || !object_path || !interface_name || !method
        || !first_argument || !result) {
        setError("D-Bus property call received a null argument");
        return -1;
    }
    if (property_count < 0 || (property_count > 0 && !properties)) {
        setError("invalid D-Bus property list");
        return -4;
    }

    DBusError error;
    dbus_error_init(&error);
    DBusMessage* message = dbus_message_new_method_call(service, object_path, interface_name, method);
    if (!message) {
        setError("could not allocate a D-Bus property message");
        return -2;
    }

    DBusMessageIter root;
    DBusMessageIter array;
    dbus_message_iter_init_append(message, &root);
    if (!dbus_message_iter_append_basic(&root, DBUS_TYPE_STRING, &first_argument)
        || !dbus_message_iter_open_container(&root, DBUS_TYPE_ARRAY, "{sv}", &array)) {
        dbus_message_unref(message);
        setError("could not build the D-Bus property message");
        return -2;
    }

    for (int32_t i = 0; i < property_count; ++i) {
        const GeaDbusProperty& property = properties[i];
        if (!property.key) {
            setError("D-Bus property %d has a null key", i);
            dbus_message_unref(message);
            return -4;
        }
        const char* signature = signatureForKind(property.value.kind);
        if (!signature) {
            setError("unsupported D-Bus property kind %d", property.value.kind);
            dbus_message_unref(message);
            return -4;
        }

        DBusMessageIter entry;
        DBusMessageIter variant;
        if (!dbus_message_iter_open_container(&array, DBUS_TYPE_DICT_ENTRY, nullptr, &entry)) {
            setError("could not open a D-Bus dict entry");
            dbus_message_unref(message);
            return -2;
        }
        if (!dbus_message_iter_append_basic(&entry, DBUS_TYPE_STRING, &property.key)
            || !dbus_message_iter_open_container(&entry, DBUS_TYPE_VARIANT, signature, &variant)) {
            setError("could not append a D-Bus property key");
            dbus_message_unref(message);
            return -2;
        }
        int32_t status = appendBasicValue(&variant, property.value);
        if (status != 0
            || !dbus_message_iter_close_container(&entry, &variant)
            || !dbus_message_iter_close_container(&array, &entry)) {
            dbus_message_unref(message);
            return status != 0 ? status : -2;
        }
    }

    if (!dbus_message_iter_close_container(&root, &array)) {
        dbus_message_unref(message);
        setError("could not close the D-Bus property array");
        return -2;
    }

    DBusMessage* reply = dbus_connection_send_with_reply_and_block(
        static_cast<DBusConnection*>(connection), message, 25000, &error);
    dbus_message_unref(message);
    if (!reply) {
        setDbusError(error, "D-Bus property call failed");
        return -3;
    }
    if (dbus_message_get_type(reply) == DBUS_MESSAGE_TYPE_ERROR) {
        const char* name = dbus_message_get_error_name(reply);
        setError("D-Bus property call failed: %s", name ? name : "unknown error");
        dbus_message_unref(reply);
        return -3;
    }

    DBusMessageIter iter;
    if (!dbus_message_iter_init(reply, &iter)
        || dbus_message_iter_get_arg_type(&iter) != DBUS_TYPE_UINT32) {
        setError("D-Bus property call returned no uint32");
        dbus_message_unref(reply);
        return -4;
    }
    dbus_message_iter_get_basic(&iter, result);
    dbus_message_unref(reply);
    return 0;
}

const char* gea_ffi_dbus_last_error(void) {
    return g_last_error;
}

void gea_ffi_dbus_clear_error(void) {
    clearError();
}

void gea_ffi_dbus_free(void* ptr) {
    std::free(ptr);
}

}

#endif
