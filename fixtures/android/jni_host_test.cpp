// SPDX-License-Identifier: Apache-2.0
/*
 * Host JVM test for the Android/JNI native bridge.
 *
 * Starts a real JVM through the JNI invocation API, attaches the GeaStack
 * bridge, and calls static/instance Java methods across the C ABI.
 */
#include "gea/ffi/gea_ffi_android.h"

#include <jni.h>

#include <cstdio>
#include <cstring>
#include <string>
#include <vector>

using gea::ffi::android::JniEnvScope;

static int fail(const char* message) {
    std::fprintf(stderr, "jni_test: %s (last_error=%s)\n", message, gea_ffi_android_last_error());
    return 1;
}

static GeaJniValue intValue(int32_t value) {
    GeaJniValue result{};
    result.kind = GEA_JNI_INT;
    result.as.i = value;
    return result;
}

static GeaJniValue longValue(int64_t value) {
    GeaJniValue result{};
    result.kind = GEA_JNI_LONG;
    result.as.j = value;
    return result;
}

static GeaJniValue doubleValue(double value) {
    GeaJniValue result{};
    result.kind = GEA_JNI_DOUBLE;
    result.as.d = value;
    return result;
}

static GeaJniValue boolValue(bool value) {
    GeaJniValue result{};
    result.kind = GEA_JNI_BOOLEAN;
    result.as.z = value ? 1 : 0;
    return result;
}

static GeaJniValue stringValue(const char* value) {
    GeaJniValue result{};
    result.kind = GEA_JNI_STRING;
    result.as.str = value;
    return result;
}

static GeaJniValue objectValue(void* value) {
    GeaJniValue result{};
    result.kind = GEA_JNI_OBJECT;
    result.as.l = value;
    return result;
}

static GeaJniValue typeValue(int32_t kind) {
    GeaJniValue result{};
    result.kind = kind;
    return result;
}

static std::string readString(void* javaString) {
    int32_t length = gea_ffi_android_string_to_utf8(javaString, nullptr, 0);
    if (length < 0) return std::string();
    std::vector<char> buffer(static_cast<size_t>(length) + 1, '\0');
    gea_ffi_android_string_to_utf8(javaString, buffer.data(), static_cast<int32_t>(buffer.size()));
    return std::string(buffer.data(), static_cast<size_t>(length));
}

int main(int argc, char** argv) {
    if (argc < 2) {
        std::fprintf(stderr, "usage: jni_test <classes-dir>\n");
        return 2;
    }

    std::string classpath = std::string("-Djava.class.path=") + argv[1];
    JavaVMOption options[2];
    options[0].optionString = const_cast<char*>(classpath.c_str());
    options[1].optionString = const_cast<char*>("-Xcheck:jni");

    JavaVMInitArgs vmArgs{};
    vmArgs.version = JNI_VERSION_1_8;
    vmArgs.nOptions = 2;
    vmArgs.options = options;
    vmArgs.ignoreUnrecognized = JNI_FALSE;

    JavaVM* vm = nullptr;
    JNIEnv* env = nullptr;
    if (JNI_CreateJavaVM(&vm, reinterpret_cast<void**>(&env), &vmArgs) != JNI_OK) {
        std::fprintf(stderr, "jni_test: JNI_CreateJavaVM failed\n");
        return 1;
    }

    if (gea_ffi_android_attach(vm) != 0) return fail("attach failed");
    if (gea_ffi_android_java_vm() != vm) return fail("JavaVM identity mismatch");
    if (gea_ffi_android_env() != env) return fail("JNIEnv identity mismatch");

    void* clazz = gea_ffi_android_find_class("GeaJniTest");
    if (!clazz) return fail("GeaJniTest not found");

    void* add = gea_ffi_android_get_static_method(clazz, "add", "(II)I");
    if (!add) return fail("add method not found");
    GeaJniValue args[2] = {intValue(19), intValue(23)};
    GeaJniValue result = typeValue(GEA_JNI_INT);
    if (gea_ffi_android_call_static(clazz, add, args, 2, &result) != 0) return fail("add call failed");
    if (result.as.i != 42) return fail("add returned the wrong value");

    void* addLong = gea_ffi_android_get_static_method(clazz, "addLong", "(JJ)J");
    if (!addLong) return fail("addLong method not found");
    GeaJniValue longArgs[2] = {longValue(4000000000LL), longValue(123456789LL)};
    result = typeValue(GEA_JNI_LONG);
    if (gea_ffi_android_call_static(clazz, addLong, longArgs, 2, &result) != 0) return fail("addLong call failed");
    if (result.as.j != 4123456789LL) return fail("addLong returned the wrong value");

    void* half = gea_ffi_android_get_static_method(clazz, "half", "(D)D");
    if (!half) return fail("half method not found");
    GeaJniValue halfArg = doubleValue(21.0);
    result = typeValue(GEA_JNI_DOUBLE);
    if (gea_ffi_android_call_static(clazz, half, &halfArg, 1, &result) != 0) return fail("half call failed");
    if (result.as.d != 10.5) return fail("half returned the wrong value");

    void* negate = gea_ffi_android_get_static_method(clazz, "negate", "(Z)Z");
    if (!negate) return fail("negate method not found");
    GeaJniValue boolArg = boolValue(false);
    result = typeValue(GEA_JNI_BOOLEAN);
    if (gea_ffi_android_call_static(clazz, negate, &boolArg, 1, &result) != 0) return fail("negate call failed");
    if (!result.as.z) return fail("negate returned the wrong value");

    void* greet = gea_ffi_android_get_static_method(clazz, "greet", "(Ljava/lang/String;)Ljava/lang/String;");
    if (!greet) return fail("greet method not found");
    GeaJniValue nameArg = stringValue("GeaStack");
    result = typeValue(GEA_JNI_STRING);
    if (gea_ffi_android_call_static(clazz, greet, &nameArg, 1, &result) != 0) return fail("greet call failed");
    if (!result.as.l) return fail("greet returned null");
    std::string greeting = readString(result.as.l);
    if (greeting != "hello GeaStack \xF0\x9F\x8C\x8D") return fail("greet returned the wrong string");
    gea_ffi_android_delete_ref(result.as.l);

    // Constructor + instance calls.
    void* constructor = gea_ffi_android_get_constructor(clazz, "(I)V");
    if (!constructor) return fail("constructor not found");
    GeaJniValue baseArg = intValue(40);
    void* instance = nullptr;
    if (gea_ffi_android_new_object(clazz, constructor, &baseArg, 1, &instance) != 0 || !instance) {
        return fail("constructor call failed");
    }
    void* instanceAdd = gea_ffi_android_get_method(clazz, "instanceAdd", "(I)I");
    if (!instanceAdd) return fail("instanceAdd not found");
    GeaJniValue two = intValue(2);
    result = typeValue(GEA_JNI_INT);
    if (gea_ffi_android_call_instance(instance, instanceAdd, &two, 1, &result) != 0) return fail("instanceAdd call failed");
    if (result.as.i != 42) return fail("instanceAdd returned the wrong value");

    void* instanceName = gea_ffi_android_get_method(clazz, "instanceName", "()Ljava/lang/String;");
    if (!instanceName) return fail("instanceName not found");
    result = typeValue(GEA_JNI_STRING);
    if (gea_ffi_android_call_instance(instance, instanceName, nullptr, 0, &result) != 0) return fail("instanceName call failed");
    if (readString(result.as.l) != "instance-40") return fail("instanceName returned the wrong string");
    gea_ffi_android_delete_ref(result.as.l);
    gea_ffi_android_delete_ref(instance);

    // Byte arrays.
    void* reverse = gea_ffi_android_get_static_method(clazz, "reverse", "([B)[B");
    if (!reverse) return fail("reverse method not found");
    const uint8_t input[] = {1, 2, 3, 4};
    void* array = gea_ffi_android_new_byte_array(input, 4);
    if (!array) return fail("new byte array failed");
    if (gea_ffi_android_byte_array_length(array) != 4) return fail("byte array length mismatch");
    GeaJniValue arrayArg = objectValue(array);
    result = typeValue(GEA_JNI_OBJECT);
    if (gea_ffi_android_call_static(clazz, reverse, &arrayArg, 1, &result) != 0) return fail("reverse call failed");
    uint8_t output[4] = {0, 0, 0, 0};
    if (gea_ffi_android_byte_array_copy(result.as.l, output, 4) != 4) return fail("byte array copy failed");
    if (output[0] != 4 || output[1] != 3 || output[2] != 2 || output[3] != 1) return fail("reverse returned the wrong bytes");
    gea_ffi_android_delete_ref(result.as.l);
    gea_ffi_android_delete_ref(array);

    // Missing classes and methods report an error without poisoning later calls.
    if (gea_ffi_android_find_class("no/such/GeaJniClass") != nullptr) return fail("missing class resolved");
    if (std::strlen(gea_ffi_android_last_error()) == 0) return fail("missing class did not set an error");
    if (gea_ffi_android_get_static_method(clazz, "missing", "()V") != nullptr) return fail("missing method resolved");

    void* boom = gea_ffi_android_get_static_method(clazz, "boom", "()I");
    if (!boom) return fail("boom method not found");
    result = typeValue(GEA_JNI_INT);
    if (gea_ffi_android_call_static(clazz, boom, nullptr, 0, &result) != -3) return fail("Java exception was not reported");
    if (std::strlen(gea_ffi_android_last_error()) == 0) return fail("Java exception did not set an error");
    if (gea_ffi_android_exception_check() != 0) return fail("exception was not cleared");

    // Calling add again proves the bridge is still usable after an exception.
    result = typeValue(GEA_JNI_INT);
    if (gea_ffi_android_call_static(clazz, add, args, 2, &result) != 0) return fail("call after exception failed");
    if (result.as.i != 42) return fail("call after exception returned the wrong value");

    gea_ffi_android_delete_ref(clazz);
    JniEnvScope::detachCurrentThread();

    if (vm->DestroyJavaVM() != 0) return fail("DestroyJavaVM failed");
    std::puts("jni_test ok");
    return 0;
}
