// SPDX-License-Identifier: Apache-2.0
/*
 * Host test for the libffi-based generic call engine.
 * Run on Linux (or any host with pkg-config libffi).
 */
#include "gea/ffi/gea_ffi.h"

#include <atomic>
#include <cstdio>
#include <cstring>
#include <thread>
#include <unistd.h>
#include <vector>

static int fail(const char* message) {
    std::fprintf(stderr, "ffi_call_test: %s (last_error=%s)\n", message, gea_ffi_call_last_error());
    return 1;
}

static GeaCallValue int32Value(int32_t value) {
    GeaCallValue result{};
    result.kind = GEA_CALL_INT32;
    result.as.i32 = value;
    return result;
}

static GeaCallValue uint64Value(uint64_t value) {
    GeaCallValue result{};
    result.kind = GEA_CALL_UINT64;
    result.as.u64 = value;
    return result;
}

static GeaCallValue doubleValue(double value) {
    GeaCallValue result{};
    result.kind = GEA_CALL_DOUBLE;
    result.as.d = value;
    return result;
}

static GeaCallValue stringValue(const char* value) {
    GeaCallValue result{};
    result.kind = GEA_CALL_STRING;
    result.as.str = value;
    return result;
}

static GeaCallValue pointerValue(void* value) {
    GeaCallValue result{};
    result.kind = GEA_CALL_POINTER;
    result.as.ptr = value;
    return result;
}


static int applyCallback(int value, int (*callback)(int)) {
    return callback(value);
}

static void closureCallback(void* userdata, void* ret, void** args) {
    const int factor = *static_cast<int*>(userdata);
    const int value = *static_cast<int*>(args[0]);
    *static_cast<int*>(ret) = value * factor;
}

int main() {
    if (!gea_ffi_call_available()) {
        std::puts("ffi_call_test skipped (libffi is not compiled in)");
        return 0;
    }

    void* libc = gea_ffi_dlopen("libc.so.6");
    if (!libc) return fail("libc.so.6 not found");

    GeaCallValue result{};
    result.kind = GEA_CALL_INT32;
    void* getpidFn = gea_ffi_dlsym(libc, "getpid");
    if (!getpidFn) return fail("getpid missing");
    if (gea_ffi_call(getpidFn, nullptr, 0, &result) != 0) return fail("getpid call failed");
    if (result.as.i32 != getpid()) return fail("getpid result mismatch");

    GeaCallValue strlenArgs[1] = {stringValue("geastack")};
    result = uint64Value(0);
    void* strlenFn = gea_ffi_dlsym(libc, "strlen");
    if (!strlenFn) return fail("strlen missing");
    if (gea_ffi_call(strlenFn, strlenArgs, 1, &result) != 0) return fail("strlen call failed");
    if (result.as.u64 != 8) return fail("strlen result mismatch");

    GeaCallValue strcmpArgs[2] = {stringValue("geastack"), stringValue("geastack")};
    result = int32Value(-1);
    void* strcmpFn = gea_ffi_dlsym(libc, "strcmp");
    if (!strcmpFn) return fail("strcmp missing");
    if (gea_ffi_call(strcmpFn, strcmpArgs, 2, &result) != 0) return fail("strcmp call failed");
    if (result.as.i32 != 0) return fail("strcmp result mismatch");

    GeaCallValue absArg = int32Value(-42);
    result = int32Value(0);
    void* absFn = gea_ffi_dlsym(libc, "abs");
    if (!absFn) return fail("abs missing");
    if (gea_ffi_call(absFn, &absArg, 1, &result) != 0) return fail("abs call failed");
    if (result.as.i32 != 42) return fail("abs result mismatch");

    GeaCallValue upperArg = int32Value('a');
    result = int32Value(0);
    void* toupperFn = gea_ffi_dlsym(libc, "toupper");
    if (!toupperFn) return fail("toupper missing");
    if (gea_ffi_call(toupperFn, &upperArg, 1, &result) != 0) return fail("toupper call failed");
    if (result.as.i32 != 'A') return fail("toupper result mismatch");

    GeaCallValue mallocArg = uint64Value(64);
    result = pointerValue(nullptr);
    void* mallocFn = gea_ffi_dlsym(libc, "malloc");
    void* freeFn = gea_ffi_dlsym(libc, "free");
    if (!mallocFn || !freeFn) return fail("malloc/free missing");
    if (gea_ffi_call(mallocFn, &mallocArg, 1, &result) != 0) return fail("malloc call failed");
    if (!result.as.ptr) return fail("malloc returned null");
    std::memset(result.as.ptr, 0x5a, 64);
    GeaCallValue block = pointerValue(result.as.ptr);
    GeaCallValue freeResult{};
    freeResult.kind = GEA_CALL_VOID;
    if (gea_ffi_call(freeFn, &block, 1, &freeResult) != 0) return fail("free call failed");

    void* timeval = gea_ffi_alloc(64);
    if (!timeval) return fail("gea_ffi_alloc failed");
    std::memset(timeval, 0, 64);
    GeaCallValue timeArgs[2] = {pointerValue(timeval), pointerValue(nullptr)};
    result = int32Value(-1);
    void* gettimeofdayFn = gea_ffi_dlsym(libc, "gettimeofday");
    if (!gettimeofdayFn) return fail("gettimeofday missing");
    if (gea_ffi_call(gettimeofdayFn, timeArgs, 2, &result) != 0) return fail("gettimeofday call failed");
    if (result.as.i32 != 0) return fail("gettimeofday result mismatch");
    gea_ffi_free(timeval);

    void* libm = gea_ffi_dlopen("libm.so.6");
    if (!libm) return fail("libm.so.6 not found");
    GeaCallValue powArgs[2] = {doubleValue(2.0), doubleValue(8.0)};
    result = doubleValue(0.0);
    void* powFn = gea_ffi_dlsym(libm, "pow");
    if (!powFn) return fail("pow missing");
    if (gea_ffi_call(powFn, powArgs, 2, &result) != 0) return fail("pow call failed");
    if (result.as.d != 256.0) return fail("pow result mismatch");

    result = int32Value(0);
    if (gea_ffi_call(nullptr, nullptr, 0, &result) == 0) return fail("null function succeeded");
    if (std::strlen(gea_ffi_call_last_error()) == 0) return fail("null function did not set an error");

    gea_ffi_dlclose(libm);
    gea_ffi_dlclose(libc);
    GeaCallKind closureArgKind = GEA_CALL_INT32;
    void* closure = nullptr;
    int factor = 3;
    if (gea_ffi_closure_create(GEA_CALL_INT32, &closureArgKind, 1, closureCallback, &factor, &closure) != 0) {
        return fail("closure creation failed");
    }
    auto closureFn = reinterpret_cast<int (*)(int)>(closure);
    if (!closureFn || applyCallback(14, closureFn) != 42) return fail("closure result mismatch");
    gea_ffi_closure_free(closure);

    // Reject GEA_CALL_VOID as an argument kind.
    GeaCallKind voidArgKind = GEA_CALL_VOID;
    void* badClosure = nullptr;
    if (gea_ffi_closure_create(GEA_CALL_VOID, &voidArgKind, 1, closureCallback, &factor, &badClosure) == 0) {
        return fail("void closure argument unexpectedly succeeded");
    }
    GeaCallValue voidArg{};
    voidArg.kind = GEA_CALL_VOID;
    GeaCallValue voidRes{};
    voidRes.kind = GEA_CALL_VOID;
    if (gea_ffi_call(reinterpret_cast<void*>(applyCallback), &voidArg, 1, &voidRes) == 0) {
        return fail("void call argument unexpectedly succeeded");
    }

    // Concurrent closure create/invoke/free stress test.
    std::atomic<int> threadFailures{0};
    std::vector<std::thread> threads;
    for (int t = 0; t < 4; ++t) {
        threads.emplace_back([&, t]() {
            int localFactor = t + 2;
            for (int i = 0; i < 16; ++i) {
                void* fnPtr = nullptr;
                if (gea_ffi_closure_create(GEA_CALL_INT32, &closureArgKind, 1, closureCallback, &localFactor, &fnPtr) != 0) {
                    threadFailures.fetch_add(1);
                    return;
                }
                auto fn = reinterpret_cast<int (*)(int)>(fnPtr);
                if (!fn || applyCallback(i, fn) != i * localFactor) {
                    threadFailures.fetch_add(1);
                }
                gea_ffi_closure_free(fnPtr);
            }
        });
    }
    for (auto& t : threads) t.join();
    if (threadFailures.load() != 0) return fail("concurrent closure test failed");

    std::puts("ffi_call_test ok");
    return 0;
}
