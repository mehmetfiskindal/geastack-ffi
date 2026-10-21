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

const char* signatureForKind(int32_t kind);

int32_t appendBasicValue(DBusMessageIter* iter, const GeaDbusValue& value) {
    if (value.kind == GEA_DBUS_INT32_ARRAY) {
        const GeaDbusInt32Array* array = value.as.int32Array;
        if (!array || array->count < 0) {
            setError("invalid D-Bus int32 array");
            return -4;
        }
        DBusMessageIter container;
        if (!dbus_message_iter_open_container(iter, DBUS_TYPE_ARRAY, "i", &container)) {
            setError("could not append a D-Bus int32 array");
            return -2;
        }
        for (int32_t i = 0; i < array->count; ++i) {
            int32_t number = array->values ? array->values[i] : 0;
            if (!dbus_message_iter_append_basic(&container, DBUS_TYPE_INT32, &number)) {
                setError("could not append D-Bus int32 array element %d", i);
                return -2;
            }
        }
        if (!dbus_message_iter_close_container(iter, &container)) {
            setError("could not close the D-Bus int32 array");
            return -2;
        }
        return 0;
    }

    if (value.kind == GEA_DBUS_STRING_ARRAY || value.kind == GEA_DBUS_OBJECT_PATH_ARRAY) {
        const bool objectPaths = value.kind == GEA_DBUS_OBJECT_PATH_ARRAY;
        const char* elementSignature = objectPaths ? "o" : "s";
        const GeaDbusStringArray* array = value.as.array;
        if (!array || array->count < 0) {
            setError("invalid D-Bus string array");
            return -4;
        }
        DBusMessageIter container;
        if (!dbus_message_iter_open_container(iter, DBUS_TYPE_ARRAY, elementSignature, &container)) {
            setError("could not append a D-Bus string array");
            return -2;
        }
        for (int32_t i = 0; i < array->count; ++i) {
            const char* text = array->values ? array->values[i] : nullptr;
            const char* safe = text ? text : "";
            if (!dbus_message_iter_append_basic(&container, objectPaths ? DBUS_TYPE_OBJECT_PATH : DBUS_TYPE_STRING, &safe)) {
                setError("could not append D-Bus string array element %d", i);
                return -2;
            }
        }
        if (!dbus_message_iter_close_container(iter, &container)) {
            setError("could not close the D-Bus string array");
            return -2;
        }
        return 0;
    }

    if (value.kind == GEA_DBUS_BYTE_ARRAY) {
        const GeaDbusByteArray* bytes = value.as.bytes;
        if (!bytes || bytes->count < 0) {
            setError("invalid D-Bus byte array");
            return -4;
        }
        DBusMessageIter container;
        if (!dbus_message_iter_open_container(iter, DBUS_TYPE_ARRAY, "y", &container)) {
            setError("could not append a D-Bus byte array");
            return -2;
        }
        for (int32_t i = 0; i < bytes->count; ++i) {
            uint8_t byte = bytes->data ? bytes->data[i] : 0;
            if (!dbus_message_iter_append_basic(&container, DBUS_TYPE_BYTE, &byte)) {
                setError("could not append D-Bus byte array element %d", i);
                return -2;
            }
        }
        if (!dbus_message_iter_close_container(iter, &container)) {
            setError("could not close the D-Bus byte array");
            return -2;
        }
        return 0;
    }

    if (value.kind == GEA_DBUS_STRING_DICT) {
        const GeaDbusStringDictionary* dict = value.as.stringDict;
        if (!dict || dict->count < 0 || (dict->count > 0 && !dict->entries)) {
            setError("invalid D-Bus string dictionary");
            return -4;
        }
        DBusMessageIter container;
        if (!dbus_message_iter_open_container(iter, DBUS_TYPE_ARRAY, "{ss}", &container)) {
            setError("could not append a D-Bus string dictionary");
            return -2;
        }
        for (int32_t i = 0; i < dict->count; ++i) {
            const GeaDbusStringPair& entry = dict->entries[i];
            const char* key = entry.key ? entry.key : "";
            const char* text = entry.value ? entry.value : "";
            DBusMessageIter dictEntry;
            if (!dbus_message_iter_open_container(&container, DBUS_TYPE_DICT_ENTRY, nullptr, &dictEntry)
                || !dbus_message_iter_append_basic(&dictEntry, DBUS_TYPE_STRING, &key)
                || !dbus_message_iter_append_basic(&dictEntry, DBUS_TYPE_STRING, &text)
                || !dbus_message_iter_close_container(&container, &dictEntry)) {
                setError("could not append a D-Bus string dictionary entry");
                return -2;
            }
        }
        if (!dbus_message_iter_close_container(iter, &container)) {
            setError("could not close the D-Bus string dictionary");
            return -2;
        }
        return 0;
    }

    if (value.kind == GEA_DBUS_DICT) {
        const GeaDbusDictionary* dict = value.as.dict;
        if (!dict || dict->count < 0 || (dict->count > 0 && !dict->entries)) {
            setError("invalid D-Bus dictionary");
            return -4;
        }
        DBusMessageIter container;
        if (!dbus_message_iter_open_container(iter, DBUS_TYPE_ARRAY, "{sv}", &container)) {
            setError("could not append a D-Bus dictionary");
            return -2;
        }
        for (int32_t i = 0; i < dict->count; ++i) {
            const GeaDbusProperty& entry = dict->entries[i];
            const char* signature = signatureForKind(entry.value.kind);
            if (!entry.key || !signature) {
                setError("invalid D-Bus dictionary entry %d", i);
                return -4;
            }
            DBusMessageIter dictEntry;
            DBusMessageIter variant;
            if (!dbus_message_iter_open_container(&container, DBUS_TYPE_DICT_ENTRY, nullptr, &dictEntry)
                || !dbus_message_iter_append_basic(&dictEntry, DBUS_TYPE_STRING, &entry.key)
                || !dbus_message_iter_open_container(&dictEntry, DBUS_TYPE_VARIANT, signature, &variant)) {
                setError("could not append a D-Bus dictionary entry");
                return -2;
            }
            int32_t status = appendBasicValue(&variant, entry.value);
            if (status != 0
                || !dbus_message_iter_close_container(&dictEntry, &variant)
                || !dbus_message_iter_close_container(&container, &dictEntry)) {
                return status != 0 ? status : -2;
            }
        }
        if (!dbus_message_iter_close_container(iter, &container)) {
            setError("could not close the D-Bus dictionary");
            return -2;
        }
        return 0;
    }

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
        case GEA_DBUS_STRING_ARRAY: return "as";
        case GEA_DBUS_BYTE_ARRAY: return "ay";
        case GEA_DBUS_DICT: return "a{sv}";
        case GEA_DBUS_OBJECT_PATH_ARRAY: return "ao";
        case GEA_DBUS_STRING_DICT: return "a{ss}";
        case GEA_DBUS_INT32_ARRAY: return "ai";
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

    if (type == DBUS_TYPE_ARRAY) {
        const int elementType = dbus_message_iter_get_element_type(iter);
        if (elementType == DBUS_TYPE_DICT_ENTRY) {
            char* signature = dbus_message_iter_get_signature(iter);
            const bool stringDict = signature && std::strcmp(signature, "a{ss}") == 0;
            if (signature) dbus_free(signature);
            if (stringDict) {
                DBusMessageIter dictIter;
                dbus_message_iter_recurse(iter, &dictIter);
                int32_t count = 0;
                while (dbus_message_iter_get_arg_type(&dictIter) == DBUS_TYPE_DICT_ENTRY) {
                    ++count;
                    if (!dbus_message_iter_next(&dictIter)) break;
                }
                auto* dict = static_cast<GeaDbusStringDictionary*>(std::calloc(1, sizeof(GeaDbusStringDictionary)));
                if (!dict) {
                    setError("out of memory allocating a D-Bus string dictionary");
                    return -2;
                }
                dict->count = count;
                if (count > 0) {
                    auto* entries = static_cast<GeaDbusStringPair*>(std::calloc(static_cast<size_t>(count), sizeof(GeaDbusStringPair)));
                    if (!entries) {
                        std::free(dict);
                        setError("out of memory allocating D-Bus string dictionary entries");
                        return -2;
                    }
                    dict->entries = entries;
                }
                dbus_message_iter_recurse(iter, &dictIter);
                for (int32_t i = 0; i < count; ++i) {
                    DBusMessageIter entry;
                    dbus_message_iter_recurse(&dictIter, &entry);
                    const char* key = "";
                    const char* value = "";
                    dbus_message_iter_get_basic(&entry, &key);
                    dbus_message_iter_next(&entry);
                    dbus_message_iter_get_basic(&entry, &value);
                    auto* writable = const_cast<GeaDbusStringPair*>(&dict->entries[i]);
                    writable->key = ::strdup(key);
                    writable->value = ::strdup(value);
                    if (!writable->key || !writable->value) {
                        setError("out of memory copying a D-Bus string dictionary entry");
                        return -2;
                    }
                    if (i + 1 < count) dbus_message_iter_next(&dictIter);
                }
                result.kind = GEA_DBUS_STRING_DICT;
                result.as.stringDict = dict;
                return 0;
            }
            DBusMessageIter dictIter;
            dbus_message_iter_recurse(iter, &dictIter);
            int32_t count = 0;
            while (dbus_message_iter_get_arg_type(&dictIter) == DBUS_TYPE_DICT_ENTRY) {
                ++count;
                if (!dbus_message_iter_next(&dictIter)) break;
            }
            auto* dict = static_cast<GeaDbusDictionary*>(std::calloc(1, sizeof(GeaDbusDictionary)));
            if (!dict) {
                setError("out of memory allocating a D-Bus dictionary");
                return -2;
            }
            dict->count = count;
            if (count > 0) {
                auto* entries = static_cast<GeaDbusProperty*>(std::calloc(static_cast<size_t>(count), sizeof(GeaDbusProperty)));
                if (!entries) {
                    std::free(dict);
                    setError("out of memory allocating D-Bus dictionary entries");
                    return -2;
                }
                dict->entries = entries;
            }
            dbus_message_iter_recurse(iter, &dictIter);
            for (int32_t i = 0; i < count; ++i) {
                DBusMessageIter entry;
                dbus_message_iter_recurse(&dictIter, &entry);
                const char* key = nullptr;
                dbus_message_iter_get_basic(&entry, &key);
                auto* writable = const_cast<GeaDbusProperty*>(&dict->entries[i]);
                writable->key = key ? ::strdup(key) : ::strdup("");
                if (!writable->key) {
                    setError("out of memory copying a D-Bus dictionary key");
                    return -2;
                }
                dbus_message_iter_next(&entry);
                if (dbus_message_iter_get_arg_type(&entry) != DBUS_TYPE_VARIANT) {
                    setError("D-Bus dictionary entry has no variant");
                    return -4;
                }
                DBusMessageIter variant;
                dbus_message_iter_recurse(&entry, &variant);
                int32_t status = readBasicValue(&variant, writable->value);
                if (status != 0) return status;
                if (i + 1 < count) dbus_message_iter_next(&dictIter);
            }
            result.kind = GEA_DBUS_DICT;
            result.as.dict = dict;
            return 0;
        }
        if (elementType == DBUS_TYPE_INT32) {
            DBusMessageIter valuesIter;
            dbus_message_iter_recurse(iter, &valuesIter);
            int32_t count = 0;
            while (dbus_message_iter_get_arg_type(&valuesIter) != DBUS_TYPE_INVALID) {
                ++count;
                if (!dbus_message_iter_next(&valuesIter)) break;
            }
            auto* array = static_cast<GeaDbusInt32Array*>(std::calloc(1, sizeof(GeaDbusInt32Array)));
            if (!array) {
                setError("out of memory allocating a D-Bus int32 array");
                return -2;
            }
            array->count = count;
            if (count > 0) {
                auto* values = static_cast<int32_t*>(std::malloc(static_cast<size_t>(count) * sizeof(int32_t)));
                if (!values) {
                    std::free(array);
                    setError("out of memory allocating D-Bus int32 array values");
                    return -2;
                }
                array->values = values;
            }
            dbus_message_iter_recurse(iter, &valuesIter);
            for (int32_t i = 0; i < count; ++i) {
                int32_t number = 0;
                dbus_message_iter_get_basic(&valuesIter, &number);
                const_cast<int32_t*>(array->values)[i] = number;
                if (i + 1 < count) dbus_message_iter_next(&valuesIter);
            }
            result.kind = GEA_DBUS_INT32_ARRAY;
            result.as.int32Array = array;
            return 0;
        }
        if (elementType == DBUS_TYPE_BYTE) {
            DBusMessageIter bytesIter;
            dbus_message_iter_recurse(iter, &bytesIter);
            int32_t count = 0;
            while (dbus_message_iter_get_arg_type(&bytesIter) != DBUS_TYPE_INVALID) {
                ++count;
                if (!dbus_message_iter_next(&bytesIter)) break;
            }
            auto* bytes = static_cast<GeaDbusByteArray*>(std::calloc(1, sizeof(GeaDbusByteArray)));
            if (!bytes) {
                setError("out of memory allocating a D-Bus byte array");
                return -2;
            }
            bytes->count = count;
            if (count > 0) {
                auto* data = static_cast<uint8_t*>(std::malloc(static_cast<size_t>(count)));
                if (!data) {
                    std::free(bytes);
                    setError("out of memory allocating D-Bus byte array data");
                    return -2;
                }
                bytes->data = data;
            }
            dbus_message_iter_recurse(iter, &bytesIter);
            for (int32_t i = 0; i < count; ++i) {
                uint8_t byte = 0;
                dbus_message_iter_get_basic(&bytesIter, &byte);
                const_cast<uint8_t*>(bytes->data)[i] = byte;
                if (i + 1 < count) dbus_message_iter_next(&bytesIter);
            }
            result.kind = GEA_DBUS_BYTE_ARRAY;
            result.as.bytes = bytes;
            return 0;
        }
        if (elementType != DBUS_TYPE_STRING && elementType != DBUS_TYPE_OBJECT_PATH) {
            setError("unsupported D-Bus array element type");
            return -4;
        }
        DBusMessageIter sub;
        dbus_message_iter_recurse(iter, &sub);
        int32_t count = 0;
        while (dbus_message_iter_get_arg_type(&sub) != DBUS_TYPE_INVALID) {
            ++count;
            if (!dbus_message_iter_next(&sub)) break;
        }
        auto* array = static_cast<GeaDbusStringArray*>(std::calloc(1, sizeof(GeaDbusStringArray)));
        if (!array) {
            setError("out of memory allocating a D-Bus string array");
            return -2;
        }
        array->count = count;
        if (count > 0) {
            array->values = static_cast<const char**>(std::calloc(static_cast<size_t>(count), sizeof(char*)));
            if (!array->values) {
                std::free(array);
                setError("out of memory allocating D-Bus string array values");
                return -2;
            }
        }
        dbus_message_iter_recurse(iter, &sub);
        for (int32_t i = 0; i < count; ++i) {
            const char* text = nullptr;
            dbus_message_iter_get_basic(&sub, &text);
            array->values[i] = text ? ::strdup(text) : ::strdup("");
            if (!array->values[i]) {
                setError("out of memory copying a D-Bus string array element");
                return -2;
            }
            if (i + 1 < count) dbus_message_iter_next(&sub);
        }
        result.kind = elementType == DBUS_TYPE_OBJECT_PATH ? GEA_DBUS_OBJECT_PATH_ARRAY : GEA_DBUS_STRING_ARRAY;
        result.as.array = array;
        return 0;
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
            if (status == -4) {
                // Complex trailing values (arrays/dicts) are not representable;
                // keep the scalar prefix and stop instead of rejecting the signal.
                clearError();
                break;
            }
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

void gea_ffi_dbus_free_value(GeaDbusValue* value) {
    if (!value) return;
    if ((value->kind == GEA_DBUS_STRING || value->kind == GEA_DBUS_OBJECT_PATH) && value->as.str) {
        std::free(const_cast<char*>(value->as.str));
        value->as.str = nullptr;
    } else if (value->kind == GEA_DBUS_INT32_ARRAY && value->as.int32Array) {
        const GeaDbusInt32Array* array = value->as.int32Array;
        std::free(const_cast<int32_t*>(array->values));
        std::free(const_cast<GeaDbusInt32Array*>(array));
        value->as.int32Array = nullptr;
    } else if (value->kind == GEA_DBUS_STRING_DICT && value->as.stringDict) {
        const GeaDbusStringDictionary* dict = value->as.stringDict;
        if (dict->entries) {
            for (int32_t i = 0; i < dict->count; ++i) {
                auto* entry = const_cast<GeaDbusStringPair*>(&dict->entries[i]);
                std::free(const_cast<char*>(entry->key));
                std::free(const_cast<char*>(entry->value));
            }
            std::free(const_cast<GeaDbusStringPair*>(dict->entries));
        }
        std::free(const_cast<GeaDbusStringDictionary*>(dict));
        value->as.stringDict = nullptr;
    } else if (value->kind == GEA_DBUS_DICT && value->as.dict) {
        const GeaDbusDictionary* dict = value->as.dict;
        if (dict->entries) {
            for (int32_t i = 0; i < dict->count; ++i) {
                auto* entry = const_cast<GeaDbusProperty*>(&dict->entries[i]);
                std::free(const_cast<char*>(entry->key));
                gea_ffi_dbus_free_value(&entry->value);
            }
            std::free(const_cast<GeaDbusProperty*>(dict->entries));
        }
        std::free(const_cast<GeaDbusDictionary*>(dict));
        value->as.dict = nullptr;
    } else if (value->kind == GEA_DBUS_BYTE_ARRAY && value->as.bytes) {
        const GeaDbusByteArray* bytes = value->as.bytes;
        std::free(const_cast<uint8_t*>(bytes->data));
        std::free(const_cast<GeaDbusByteArray*>(bytes));
        value->as.bytes = nullptr;
    } else if ((value->kind == GEA_DBUS_STRING_ARRAY || value->kind == GEA_DBUS_OBJECT_PATH_ARRAY) && value->as.array) {
        const GeaDbusStringArray* array = value->as.array;
        if (array->values) {
            for (int32_t i = 0; i < array->count; ++i) {
                std::free(const_cast<char*>(array->values[i]));
            }
            std::free(const_cast<char**>(array->values));
        }
        std::free(const_cast<GeaDbusStringArray*>(array));
        value->as.array = nullptr;
    }
    value->kind = GEA_DBUS_INVALID;
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
