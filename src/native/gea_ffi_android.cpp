// SPDX-License-Identifier: Apache-2.0
#if defined(__ANDROID__) || defined(GEA_ENABLE_JNI)

#include "gea/ffi/gea_ffi.h"
#include <jni.h>

namespace gea::ffi::android {

static JavaVM* s_javaVM = nullptr;
static jobject s_globalContext = nullptr;

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
        if (s_javaVM->AttachCurrentThread(&env, nullptr) != JNI_OK) {
            return nullptr;
        }
    }
    return env;
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

extern "C" {

JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM* vm, void* reserved) {
    gea::ffi::android::JniEnvScope::setJavaVM(vm);
    return JNI_VERSION_1_6;
}

}

#endif
