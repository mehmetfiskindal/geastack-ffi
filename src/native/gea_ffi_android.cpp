// SPDX-License-Identifier: Apache-2.0
#if defined(__ANDROID__) || defined(GEA_ENABLE_JNI)

#include "gea/ffi/gea_ffi.h"
#include <jni.h>

#include <cstdarg>
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>

namespace gea::ffi::android {

static JavaVM* s_javaVM = nullptr;
static jobject s_globalContext = nullptr;
static thread_local bool t_attached = false;

namespace {

/**
 * The NDK's C++ jni.h declares AttachCurrentThread(JNIEnv**, void*) while the
 * desktop JDK declares AttachCurrentThread(void**, void*). Normalize both.
 */
jint attachThread(JavaVM* vm, JNIEnv** env) {
#if defined(__ANDROID__)
    return vm->AttachCurrentThread(env, nullptr);
#else
    return vm->AttachCurrentThread(reinterpret_cast<void**>(env), nullptr);
#endif
}

} // namespace

JavaVM* JniEnvScope::getJavaVM() {
    return s_javaVM;
}

void JniEnvScope::setJavaVM(JavaVM* vm) {
    s_javaVM = vm;
}

JNIEnv* JniEnvScope::getEnv() {
    if (!s_javaVM) return nullptr;
    JNIEnv* env = nullptr;
    jint res = s_javaVM->GetEnv(reinterpret_cast<void**>(&env), JNI_VERSION_1_6);
    if (res == JNI_EDETACHED) {
        if (attachThread(s_javaVM, &env) != JNI_OK) {
            return nullptr;
        }
        t_attached = true;
    }
    return env;
}

void JniEnvScope::detachCurrentThread() {
    if (s_javaVM && t_attached) {
        s_javaVM->DetachCurrentThread();
        t_attached = false;
    }
}

jobject JniEnvScope::getGlobalContext() {
    return s_globalContext;
}

void JniEnvScope::setGlobalContext(jobject context) {
    JNIEnv* env = getEnv();
    if (s_globalContext && env) {
        env->DeleteGlobalRef(s_globalContext);
    }
    if (context && env) {
        s_globalContext = env->NewGlobalRef(context);
    } else {
        s_globalContext = nullptr;
    }
}

} // namespace gea::ffi::android

namespace {

thread_local char g_last_error[512] = {0};

void setError(const char* format, ...) {
    va_list args;
    va_start(args, format);
    std::vsnprintf(g_last_error, sizeof(g_last_error), format, args);
    va_end(args);
}

void clearError() {
    g_last_error[0] = '\0';
}

JNIEnv* currentEnv() {
    JNIEnv* env = gea::ffi::android::JniEnvScope::getEnv();
    if (!env) {
        setError("no JavaVM is attached; call gea_ffi_android_attach first");
    }
    return env;
}

/** Clear a pending Java exception and record it on this thread. */
void takeException(JNIEnv* env, const char* operation) {
    if (!env->ExceptionCheck()) return;
    env->ExceptionClear();
    setError("%s threw a Java exception", operation ? operation : "JNI call");
}

/**
 * Decode standard UTF-8 into UTF-16. JNI's NewStringUTF expects Modified UTF-8,
 * which encodes characters outside the BMP as surrogate pairs and NUL as C0 80,
 * so the bridge converts instead of handing arbitrary app strings to it.
 */
std::vector<jchar> utf8ToUtf16(const char* utf8) {
    std::vector<jchar> units;
    if (!utf8) return units;
    const unsigned char* cursor = reinterpret_cast<const unsigned char*>(utf8);
    const unsigned char* end = cursor + std::strlen(utf8);
    while (cursor < end) {
        unsigned char lead = *cursor++;
        uint32_t code = 0;
        int extra = 0;
        if (lead < 0x80) {
            code = lead;
        } else if ((lead & 0xE0) == 0xC0) {
            code = lead & 0x1F; extra = 1;
        } else if ((lead & 0xF0) == 0xE0) {
            code = lead & 0x0F; extra = 2;
        } else if ((lead & 0xF8) == 0xF0) {
            code = lead & 0x07; extra = 3;
        } else {
            units.push_back(static_cast<jchar>(0xFFFD));
            continue;
        }
        bool valid = cursor + extra <= end;
        for (int i = 0; valid && i < extra; ++i) {
            if ((cursor[i] & 0xC0) != 0x80) {
                valid = false;
                break;
            }
            code = (code << 6) | (cursor[i] & 0x3F);
        }
        if (!valid || code > 0x10FFFF || (code >= 0xD800 && code <= 0xDFFF)) {
            units.push_back(static_cast<jchar>(0xFFFD));
            continue;
        }
        cursor += extra;
        if (code <= 0xFFFF) {
            units.push_back(static_cast<jchar>(code));
        } else {
            uint32_t pair = code - 0x10000;
            units.push_back(static_cast<jchar>(0xD800 + (pair >> 10)));
            units.push_back(static_cast<jchar>(0xDC00 + (pair & 0x3FF)));
        }
    }
    return units;
}

/** Encode UTF-16 (as returned by GetStringChars) into standard UTF-8. */
std::string utf16ToUtf8(const jchar* units, jsize length) {
    std::string out;
    out.reserve(static_cast<size_t>(length));
    for (jsize i = 0; i < length; ++i) {
        uint32_t code = units[i];
        if (code >= 0xD800 && code <= 0xDBFF && i + 1 < length) {
            uint32_t low = units[i + 1];
            if (low >= 0xDC00 && low <= 0xDFFF) {
                code = 0x10000 + ((code - 0xD800) << 10) + (low - 0xDC00);
                ++i;
            } else {
                code = 0xFFFD;
            }
        } else if (code >= 0xDC00 && code <= 0xDFFF) {
            code = 0xFFFD;
        }

        if (code < 0x80) {
            out.push_back(static_cast<char>(code));
        } else if (code < 0x800) {
            out.push_back(static_cast<char>(0xC0 | (code >> 6)));
            out.push_back(static_cast<char>(0x80 | (code & 0x3F)));
        } else if (code < 0x10000) {
            out.push_back(static_cast<char>(0xE0 | (code >> 12)));
            out.push_back(static_cast<char>(0x80 | ((code >> 6) & 0x3F)));
            out.push_back(static_cast<char>(0x80 | (code & 0x3F)));
        } else {
            out.push_back(static_cast<char>(0xF0 | (code >> 18)));
            out.push_back(static_cast<char>(0x80 | ((code >> 12) & 0x3F)));
            out.push_back(static_cast<char>(0x80 | ((code >> 6) & 0x3F)));
            out.push_back(static_cast<char>(0x80 | (code & 0x3F)));
        }
    }
    return out;
}

jstring newJavaString(JNIEnv* env, const char* utf8) {
    std::vector<jchar> units = utf8ToUtf16(utf8);
    return env->NewString(units.empty() ? nullptr : units.data(), static_cast<jsize>(units.size()));
}

jobject toGlobalRef(JNIEnv* env, jobject local, const char* operation) {
    if (!local) return nullptr;
    jobject global = env->NewGlobalRef(local);
    env->DeleteLocalRef(local);
    if (!global) {
        setError("%s returned a reference that could not be made global", operation);
    }
    return global;
}

int32_t appendArgument(JNIEnv* env, const GeaJniValue* argument,
                       std::vector<jvalue>& values, std::vector<jobject>& locals) {
    jvalue value{};
    switch (argument->kind) {
        case GEA_JNI_BOOLEAN: value.z = argument->as.z ? JNI_TRUE : JNI_FALSE; break;
        case GEA_JNI_BYTE:    value.b = argument->as.b; break;
        case GEA_JNI_CHAR:    value.c = argument->as.c; break;
        case GEA_JNI_SHORT:   value.s = argument->as.s; break;
        case GEA_JNI_INT:     value.i = argument->as.i; break;
        case GEA_JNI_LONG:    value.j = argument->as.j; break;
        case GEA_JNI_FLOAT:   value.f = argument->as.f; break;
        case GEA_JNI_DOUBLE:  value.d = argument->as.d; break;
        case GEA_JNI_OBJECT:  value.l = static_cast<jobject>(argument->as.l); break;
        case GEA_JNI_STRING: {
            jstring local = newJavaString(env, argument->as.str ? argument->as.str : "");
            if (!local) {
                setError("could not allocate a Java string argument");
                return -4;
            }
            locals.push_back(local);
            value.l = local;
            break;
        }
        default:
            setError("unsupported JNI argument kind %d", argument->kind);
            return -4;
    }
    values.push_back(value);
    return 0;
}

int32_t callCommon(bool isStatic, void* target, void* method,
                   const GeaJniValue* args, int32_t argc,
                   GeaJniValue* result) {
    clearError();
    if (!target || !method) {
        setError("%s target or method id is null", isStatic ? "static call" : "instance call");
        return -1;
    }
    if (!result) {
        setError("result descriptor is null");
        return -4;
    }
    if (argc < 0 || (argc > 0 && !args)) {
        setError("invalid JNI argument list");
        return -4;
    }

    JNIEnv* env = currentEnv();
    if (!env) return -1;

    std::vector<jvalue> values;
    std::vector<jobject> locals;
    values.reserve(static_cast<size_t>(argc));
    for (int32_t i = 0; i < argc; ++i) {
        int32_t status = appendArgument(env, &args[i], values, locals);
        if (status != 0) {
            for (jobject local : locals) env->DeleteLocalRef(local);
            return status;
        }
    }

    jvalue* rawArgs = values.empty() ? nullptr : values.data();
    jclass clazz = isStatic ? static_cast<jclass>(target) : nullptr;
    jobject object = isStatic ? nullptr : static_cast<jobject>(target);
    jmethodID mid = static_cast<jmethodID>(method);

#define GEA_JNI_CLEANUP_AND_RETURN(code) \
    do { \
        for (jobject local : locals) env->DeleteLocalRef(local); \
        return (code); \
    } while (0)

    switch (result->kind) {
        case GEA_JNI_VOID:
            if (isStatic) env->CallStaticVoidMethodA(clazz, mid, rawArgs);
            else env->CallVoidMethodA(object, mid, rawArgs);
            break;
        case GEA_JNI_BOOLEAN:
            result->as.z = isStatic
                ? env->CallStaticBooleanMethodA(clazz, mid, rawArgs)
                : env->CallBooleanMethodA(object, mid, rawArgs);
            break;
        case GEA_JNI_BYTE:
            result->as.b = isStatic
                ? env->CallStaticByteMethodA(clazz, mid, rawArgs)
                : env->CallByteMethodA(object, mid, rawArgs);
            break;
        case GEA_JNI_CHAR:
            result->as.c = isStatic
                ? env->CallStaticCharMethodA(clazz, mid, rawArgs)
                : env->CallCharMethodA(object, mid, rawArgs);
            break;
        case GEA_JNI_SHORT:
            result->as.s = isStatic
                ? env->CallStaticShortMethodA(clazz, mid, rawArgs)
                : env->CallShortMethodA(object, mid, rawArgs);
            break;
        case GEA_JNI_INT:
            result->as.i = isStatic
                ? env->CallStaticIntMethodA(clazz, mid, rawArgs)
                : env->CallIntMethodA(object, mid, rawArgs);
            break;
        case GEA_JNI_LONG:
            result->as.j = isStatic
                ? env->CallStaticLongMethodA(clazz, mid, rawArgs)
                : env->CallLongMethodA(object, mid, rawArgs);
            break;
        case GEA_JNI_FLOAT:
            result->as.f = isStatic
                ? env->CallStaticFloatMethodA(clazz, mid, rawArgs)
                : env->CallFloatMethodA(object, mid, rawArgs);
            break;
        case GEA_JNI_DOUBLE:
            result->as.d = isStatic
                ? env->CallStaticDoubleMethodA(clazz, mid, rawArgs)
                : env->CallDoubleMethodA(object, mid, rawArgs);
            break;
        case GEA_JNI_OBJECT:
        case GEA_JNI_STRING: {
            jobject local = isStatic
                ? env->CallStaticObjectMethodA(clazz, mid, rawArgs)
                : env->CallObjectMethodA(object, mid, rawArgs);
            if (env->ExceptionCheck()) {
                takeException(env, "object call");
                GEA_JNI_CLEANUP_AND_RETURN(-3);
            }
            result->as.l = toGlobalRef(env, local, "object call");
            break;
        }
        default:
            setError("unsupported JNI return kind %d", result->kind);
            GEA_JNI_CLEANUP_AND_RETURN(-4);
    }

#undef GEA_JNI_CLEANUP_AND_RETURN

    for (jobject local : locals) env->DeleteLocalRef(local);

    if (env->ExceptionCheck()) {
        takeException(env, "Java method");
        return -3;
    }
    return 0;
}

} // namespace

extern "C" {

int32_t gea_ffi_android_attach(void* vm) {
    clearError();
    if (!vm) {
        setError("JavaVM pointer is null");
        return -1;
    }
    gea::ffi::android::JniEnvScope::setJavaVM(static_cast<JavaVM*>(vm));
    if (!gea::ffi::android::JniEnvScope::getEnv()) {
        setError("could not obtain a JNIEnv for this thread");
        return -2;
    }
    return 0;
}

void* gea_ffi_android_java_vm(void) {
    return gea::ffi::android::JniEnvScope::getJavaVM();
}

void* gea_ffi_android_env(void) {
    return gea::ffi::android::JniEnvScope::getEnv();
}

void* gea_ffi_android_find_class(const char* name) {
    clearError();
    if (!name) {
        setError("class name is null");
        return nullptr;
    }
    JNIEnv* env = currentEnv();
    if (!env) return nullptr;
    jclass local = env->FindClass(name);
    if (!local) {
        takeException(env, "FindClass");
        setError("Java class '%s' was not found", name);
        return nullptr;
    }
    return toGlobalRef(env, local, "FindClass");
}

void* gea_ffi_android_get_static_method(void* clazz, const char* name, const char* signature) {
    clearError();
    JNIEnv* env = currentEnv();
    if (!env || !clazz || !name || !signature) {
        setError("static method lookup received a null argument");
        return nullptr;
    }
    jmethodID method = env->GetStaticMethodID(static_cast<jclass>(clazz), name, signature);
    if (!method) {
        takeException(env, "GetStaticMethodID");
        setError("static method '%s%s' was not found", name, signature);
        return nullptr;
    }
    return static_cast<void*>(method);
}

void* gea_ffi_android_get_method(void* clazz, const char* name, const char* signature) {
    clearError();
    JNIEnv* env = currentEnv();
    if (!env || !clazz || !name || !signature) {
        setError("method lookup received a null argument");
        return nullptr;
    }
    jmethodID method = env->GetMethodID(static_cast<jclass>(clazz), name, signature);
    if (!method) {
        takeException(env, "GetMethodID");
        setError("method '%s%s' was not found", name, signature);
        return nullptr;
    }
    return static_cast<void*>(method);
}

void* gea_ffi_android_get_constructor(void* clazz, const char* signature) {
    return gea_ffi_android_get_method(clazz, "<init>", signature);
}

void* gea_ffi_android_new_global_ref(void* ref) {
    clearError();
    JNIEnv* env = currentEnv();
    if (!env || !ref) {
        setError("cannot create a global reference from null");
        return nullptr;
    }
    jobject global = env->NewGlobalRef(static_cast<jobject>(ref));
    if (!global) setError("NewGlobalRef failed");
    return global;
}

void gea_ffi_android_delete_ref(void* ref) {
    if (!ref) return;
    JNIEnv* env = currentEnv();
    if (env) env->DeleteGlobalRef(static_cast<jobject>(ref));
}

void* gea_ffi_android_new_string(const char* utf8) {
    clearError();
    JNIEnv* env = currentEnv();
    if (!env || !utf8) {
        setError("cannot create a Java string from null");
        return nullptr;
    }
    jstring local = newJavaString(env, utf8);
    if (!local) {
        takeException(env, "NewString");
        return nullptr;
    }
    return toGlobalRef(env, local, "NewString");
}

int32_t gea_ffi_android_string_to_utf8(void* jstringValue, char* out, int32_t capacity) {
    clearError();
    JNIEnv* env = currentEnv();
    if (!env || !jstringValue) {
        setError("jstring is null");
        return -1;
    }
    jstring string = static_cast<jstring>(jstringValue);
    jsize length = env->GetStringLength(string);
    const jchar* chars = env->GetStringChars(string, nullptr);
    if (!chars) {
        takeException(env, "GetStringChars");
        return -1;
    }
    std::string utf8 = utf16ToUtf8(chars, length);
    env->ReleaseStringChars(string, chars);
    int32_t encodedLength = static_cast<int32_t>(utf8.size());
    if (out && capacity > 0) {
        size_t copied = utf8.size() < static_cast<size_t>(capacity - 1)
            ? utf8.size()
            : static_cast<size_t>(capacity - 1);
        std::memcpy(out, utf8.data(), copied);
        out[copied] = '\0';
    }
    return encodedLength;
}

void* gea_ffi_android_new_byte_array(const uint8_t* data, int32_t length) {
    clearError();
    JNIEnv* env = currentEnv();
    if (!env || length < 0 || (length > 0 && !data)) {
        setError("invalid byte array input");
        return nullptr;
    }
    jbyteArray local = env->NewByteArray(length);
    if (!local) {
        takeException(env, "NewByteArray");
        return nullptr;
    }
    if (length > 0) {
        env->SetByteArrayRegion(local, 0, length, reinterpret_cast<const jbyte*>(data));
    }
    return toGlobalRef(env, local, "NewByteArray");
}

int32_t gea_ffi_android_byte_array_length(void* array) {
    clearError();
    JNIEnv* env = currentEnv();
    if (!env || !array) {
        setError("byte array is null");
        return -1;
    }
    return static_cast<int32_t>(env->GetArrayLength(static_cast<jbyteArray>(array)));
}

int32_t gea_ffi_android_byte_array_copy(void* array, uint8_t* out, int32_t capacity) {
    clearError();
    JNIEnv* env = currentEnv();
    if (!env || !array) {
        setError("byte array is null");
        return -1;
    }
    jbyteArray source = static_cast<jbyteArray>(array);
    int32_t length = static_cast<int32_t>(env->GetArrayLength(source));
    int32_t copied = (out && capacity > 0) ? (length < capacity ? length : capacity) : 0;
    if (copied > 0) {
        env->GetByteArrayRegion(source, 0, copied, reinterpret_cast<jbyte*>(out));
    }
    return copied;
}

int32_t gea_ffi_android_call_static(void* clazz, void* method,
                                    const GeaJniValue* args, int32_t argc,
                                    GeaJniValue* result) {
    return callCommon(true, clazz, method, args, argc, result);
}

int32_t gea_ffi_android_call_instance(void* object, void* method,
                                      const GeaJniValue* args, int32_t argc,
                                      GeaJniValue* result) {
    return callCommon(false, object, method, args, argc, result);
}

int32_t gea_ffi_android_new_object(void* clazz, void* constructor,
                                   const GeaJniValue* args, int32_t argc,
                                   void** result) {
    clearError();
    if (!result) {
        setError("result pointer is null");
        return -4;
    }
    *result = nullptr;
    if (!clazz || !constructor) {
        setError("constructor target or method id is null");
        return -1;
    }
    if (argc < 0 || (argc > 0 && !args)) {
        setError("invalid constructor argument list");
        return -4;
    }

    JNIEnv* env = currentEnv();
    if (!env) return -1;

    std::vector<jvalue> values;
    std::vector<jobject> locals;
    values.reserve(static_cast<size_t>(argc));
    for (int32_t i = 0; i < argc; ++i) {
        int32_t status = appendArgument(env, &args[i], values, locals);
        if (status != 0) {
            for (jobject local : locals) env->DeleteLocalRef(local);
            return status;
        }
    }

    jobject local = env->NewObjectA(static_cast<jclass>(clazz),
                                    static_cast<jmethodID>(constructor),
                                    values.empty() ? nullptr : values.data());
    for (jobject item : locals) env->DeleteLocalRef(item);
    if (env->ExceptionCheck()) {
        takeException(env, "constructor");
        return -3;
    }
    *result = toGlobalRef(env, local, "NewObject");
    return *result ? 0 : -2;
}

int32_t gea_ffi_android_exception_check(void) {
    JNIEnv* env = currentEnv();
    if (!env) return -1;
    if (!env->ExceptionCheck()) return 0;
    env->ExceptionClear();
    setError("cleared a pending Java exception");
    return 1;
}

const char* gea_ffi_android_last_error(void) {
    return g_last_error;
}

void gea_ffi_android_clear_error(void) {
    clearError();
}

void gea_ffi_android_set_global_context(void* context) {
    gea::ffi::android::JniEnvScope::setGlobalContext(static_cast<jobject>(context));
}

void* gea_ffi_android_get_global_context(void) {
    return gea::ffi::android::JniEnvScope::getGlobalContext();
}

JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM* vm, void* reserved) {
    (void)reserved;
    gea::ffi::android::JniEnvScope::setJavaVM(vm);
    return JNI_VERSION_1_6;
}

}

#endif
