// SPDX-License-Identifier: Apache-2.0
#include <jni.h>

#include "gea/ffi/gea_ffi_android.h"

#include <cstring>

extern "C" JNIEXPORT jint JNICALL
Java_com_geastack_GeaAndroidRuntimeTest_bridgeAdd(JNIEnv*, jclass, jint a, jint b) {
    void* clazz = gea_ffi_android_find_class("com/geastack/GeaAndroidRuntimeTest");
    if (!clazz) return -1;
    void* method = gea_ffi_android_get_static_method(clazz, "javaAdd", "(II)I");
    if (!method) {
        gea_ffi_android_delete_ref(clazz);
        return -2;
    }

    GeaJniValue args[2] = {};
    args[0].kind = GEA_JNI_INT;
    args[0].as.i = a;
    args[1].kind = GEA_JNI_INT;
    args[1].as.i = b;

    GeaJniValue result = {};
    result.kind = GEA_JNI_INT;
    const int32_t status = gea_ffi_android_call_static(clazz, method, args, 2, &result);
    gea_ffi_android_delete_ref(clazz);
    return status == 0 ? result.as.i : -3;
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_geastack_GeaAndroidRuntimeTest_bridgeGreet(JNIEnv* env, jclass, jstring name) {
    const char* utf8 = env->GetStringUTFChars(name, nullptr);
    if (!utf8) return nullptr;

    void* clazz = gea_ffi_android_find_class("com/geastack/GeaAndroidRuntimeTest");
    void* method = clazz
        ? gea_ffi_android_get_static_method(clazz, "javaGreet", "(Ljava/lang/String;)Ljava/lang/String;")
        : nullptr;
    if (!clazz || !method) {
        env->ReleaseStringUTFChars(name, utf8);
        if (clazz) gea_ffi_android_delete_ref(clazz);
        return nullptr;
    }

    GeaJniValue argument = {};
    argument.kind = GEA_JNI_STRING;
    argument.as.str = utf8;
    GeaJniValue result = {};
    result.kind = GEA_JNI_STRING;
    const int32_t status = gea_ffi_android_call_static(clazz, method, &argument, 1, &result);

    env->ReleaseStringUTFChars(name, utf8);
    gea_ffi_android_delete_ref(clazz);
    if (status != 0 || !result.as.l) return nullptr;

    char buffer[256] = {};
    const int32_t length = gea_ffi_android_string_to_utf8(result.as.l, buffer, sizeof(buffer));
    gea_ffi_android_delete_ref(result.as.l);
    if (length < 0) return nullptr;
    return env->NewStringUTF(buffer);
}
