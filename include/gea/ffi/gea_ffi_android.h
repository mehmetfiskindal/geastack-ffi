// SPDX-License-Identifier: Apache-2.0
#pragma once

#if defined(__ANDROID__) || defined(GEA_ENABLE_JNI)
#include <jni.h>
#endif

#include "gea_ffi_types.h"

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
};

#endif

} // namespace gea::ffi::android
#endif
