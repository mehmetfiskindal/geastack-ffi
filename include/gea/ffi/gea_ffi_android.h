// SPDX-License-Identifier: Apache-2.0
#pragma once

#include "gea_ffi_types.h"

#if defined(__ANDROID__) || defined(GEA_ENABLE_JNI)
#include <jni.h>
#endif

#ifdef __cplusplus
namespace gea::ffi::android {

#if defined(__ANDROID__) || defined(GEA_ENABLE_JNI)

class JniEnvScope {
public:
    static JavaVM* getJavaVM();
    static void setJavaVM(JavaVM* vm);

    static JNIEnv* getEnv();
    static jobject getGlobalContext();
    static void setGlobalContext(jobject context);

    /** Detach the current thread if this module attached it. */
    static void detachCurrentThread();
};

#endif

} // namespace gea::ffi::android
#endif

#ifdef __cplusplus
extern "C" {
#endif

#if defined(__ANDROID__) || defined(GEA_ENABLE_JNI)

/*
 * Generic JNI bridge for native embedders.
 *
 * Method IDs are `jmethodID` values exposed as void*. Class, string, array and
 * returned object references are global references; release them with
 * gea_ffi_android_delete_ref(). All call functions return 0 on success and a
 * negative value on failure; gea_ffi_android_last_error() describes the last
 * failure on the calling thread.
 */

typedef enum GeaJniKind {
    GEA_JNI_VOID = 0,
    GEA_JNI_BOOLEAN,
    GEA_JNI_BYTE,
    GEA_JNI_CHAR,
    GEA_JNI_SHORT,
    GEA_JNI_INT,
    GEA_JNI_LONG,
    GEA_JNI_FLOAT,
    GEA_JNI_DOUBLE,
    GEA_JNI_OBJECT,
    GEA_JNI_STRING
} GeaJniKind;

typedef struct GeaJniValue {
    int32_t kind;
    union {
        uint8_t z;
        int8_t b;
        uint16_t c;
        int16_t s;
        int32_t i;
        int64_t j;
        float f;
        double d;
        void* l;
        const char* str;
    } as;
} GeaJniValue;

/** Attach the module to an existing JavaVM (for example from JNI_OnLoad). */
int32_t gea_ffi_android_attach(void* vm);
void*   gea_ffi_android_java_vm(void);
void*   gea_ffi_android_env(void);

/** Find a class and return a global reference. */
void*   gea_ffi_android_find_class(const char* name);
void*   gea_ffi_android_get_static_method(void* clazz, const char* name, const char* signature);
void*   gea_ffi_android_get_method(void* clazz, const char* name, const char* signature);
void*   gea_ffi_android_get_constructor(void* clazz, const char* signature);

void*   gea_ffi_android_new_global_ref(void* ref);
void    gea_ffi_android_delete_ref(void* ref);

void*   gea_ffi_android_new_string(const char* utf8);
/** Copy a jstring as UTF-8. Returns the byte length required, excluding NUL. */
int32_t gea_ffi_android_string_to_utf8(void* jstring, char* out, int32_t capacity);

void*   gea_ffi_android_new_byte_array(const uint8_t* data, int32_t length);
int32_t gea_ffi_android_byte_array_length(void* array);
int32_t gea_ffi_android_byte_array_copy(void* array, uint8_t* out, int32_t capacity);

/**
 * Call a static method.
 * `args[i].kind` selects the field of `args[i].as`; GEA_JNI_STRING expects a
 * UTF-8 `as.str`. `result->kind` must be set by the caller to the declared
 * return type and receives the value.
 */
int32_t gea_ffi_android_call_static(void* clazz, void* method,
                                    const GeaJniValue* args, int32_t argc,
                                    GeaJniValue* result);

/** Call an instance method. `object` must be a live jobject reference. */
int32_t gea_ffi_android_call_instance(void* object, void* method,
                                      const GeaJniValue* args, int32_t argc,
                                      GeaJniValue* result);

/** Construct an object and return a global reference in `*result`. */
int32_t gea_ffi_android_new_object(void* clazz, void* constructor,
                                   const GeaJniValue* args, int32_t argc,
                                   void** result);

/** Return 1 when a Java exception was pending (it is cleared), otherwise 0. */
int32_t gea_ffi_android_exception_check(void);

/** Last error for the calling thread. Never null; empty when there is no error. */
const char* gea_ffi_android_last_error(void);

void    gea_ffi_android_clear_error(void);
void    gea_ffi_android_set_global_context(void* context);
void*   gea_ffi_android_get_global_context(void);

#endif

#ifdef __cplusplus
}
#endif
