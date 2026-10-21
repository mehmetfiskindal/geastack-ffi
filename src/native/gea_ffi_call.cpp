// SPDX-License-Identifier: Apache-2.0
#include "gea/ffi/gea_ffi_call.h"

#include <cstdarg>
#include <cstdio>

#if defined(__has_include)
#if __has_include(<ffi.h>)
#define GEA_FFI_LIBFFI_AVAILABLE 1
#endif
#endif

#if defined(GEA_FFI_HAS_LIBFFI) && !defined(GEA_FFI_LIBFFI_AVAILABLE)
#define GEA_FFI_LIBFFI_AVAILABLE 1
#endif

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

} // namespace

#if defined(GEA_FFI_LIBFFI_AVAILABLE)

#include <ffi.h>

#include <unordered_map>
#include <vector>
#include <new>

namespace {

ffi_type* typeFor(int32_t kind) {
    switch (kind) {
        case GEA_CALL_VOID: return &ffi_type_void;
        case GEA_CALL_BOOL: return &ffi_type_uint8;
        case GEA_CALL_INT8: return &ffi_type_sint8;
        case GEA_CALL_UINT8: return &ffi_type_uint8;
        case GEA_CALL_INT16: return &ffi_type_sint16;
        case GEA_CALL_UINT16: return &ffi_type_uint16;
        case GEA_CALL_INT32: return &ffi_type_sint32;
        case GEA_CALL_UINT32: return &ffi_type_uint32;
        case GEA_CALL_INT64: return &ffi_type_sint64;
        case GEA_CALL_UINT64: return &ffi_type_uint64;
        case GEA_CALL_FLOAT: return &ffi_type_float;
        case GEA_CALL_DOUBLE: return &ffi_type_double;
        case GEA_CALL_POINTER:
        case GEA_CALL_STRING: return &ffi_type_pointer;
        default: return nullptr;
    }
}

struct ClosureContext {
    ffi_cif cif;
    ffi_type** arg_types;
    GeaFfiClosureCallback callback;
    void* userdata;
    ffi_closure* closure;
    void* code;
};

std::unordered_map<void*, ClosureContext*> g_closures;

void closureTrampoline(ffi_cif*, void* ret, void** args, void* userdata) {
    auto* context = static_cast<ClosureContext*>(userdata);
    if (context && context->callback) {
        context->callback(context->userdata, ret, args);
    }
}

union ReturnStorage {
    ffi_arg integer;
    int64_t i64;
    uint64_t u64;
    float f;
    double d;
    void* ptr;
};

} // namespace

extern "C" {

bool gea_ffi_call_available(void) {
    return true;
}

int32_t gea_ffi_call(void* function,
                     const GeaCallValue* args,
                     int32_t argc,
                     GeaCallValue* result) {
    clearError();
    if (!function) {
        setError("function pointer is null");
        return -1;
    }
    if (!result) {
        setError("result descriptor is null");
        return -4;
    }
    if (argc < 0 || (argc > 0 && !args)) {
        setError("invalid argument list");
        return -4;
    }

    ffi_type* resultType = typeFor(result->kind);
    if (!resultType) {
        setError("unsupported result kind %d", result->kind);
        return -4;
    }

    // libffi accepts a valid pointer even when nargs is zero; keep one slot.
    std::vector<ffi_type*> argumentTypes(static_cast<size_t>(argc > 0 ? argc : 1), nullptr);
    std::vector<void*> argumentValues(static_cast<size_t>(argc > 0 ? argc : 1), nullptr);
    for (int32_t i = 0; i < argc; ++i) {
        ffi_type* type = typeFor(args[i].kind);
        if (!type) {
            setError("unsupported argument kind %d at index %d", args[i].kind, i);
            return -4;
        }
        argumentTypes[static_cast<size_t>(i)] = type;
        // libffi reads the value from this address. The union member address is
        // the ABI-sized storage for that kind.
        argumentValues[static_cast<size_t>(i)] =
            const_cast<void*>(reinterpret_cast<const void*>(&args[i].as));
    }

    ffi_cif cif;
    ffi_status status = ffi_prep_cif(
        &cif,
        FFI_DEFAULT_ABI,
        static_cast<unsigned int>(argc),
        resultType,
        argumentTypes.data());
    if (status != FFI_OK) {
        setError("ffi_prep_cif failed with status %d", static_cast<int>(status));
        return -2;
    }

    ReturnStorage storage{};
    ffi_call(&cif, FFI_FN(function), &storage, argumentValues.data());

    switch (result->kind) {
        case GEA_CALL_VOID:
            break;
        case GEA_CALL_BOOL: result->as.b = static_cast<uint8_t>(storage.integer); break;
        case GEA_CALL_INT8: result->as.i8 = static_cast<int8_t>(storage.integer); break;
        case GEA_CALL_UINT8: result->as.u8 = static_cast<uint8_t>(storage.integer); break;
        case GEA_CALL_INT16: result->as.i16 = static_cast<int16_t>(storage.integer); break;
        case GEA_CALL_UINT16: result->as.u16 = static_cast<uint16_t>(storage.integer); break;
        case GEA_CALL_INT32: result->as.i32 = static_cast<int32_t>(storage.integer); break;
        case GEA_CALL_UINT32: result->as.u32 = static_cast<uint32_t>(storage.integer); break;
        case GEA_CALL_INT64: result->as.i64 = storage.i64; break;
        case GEA_CALL_UINT64: result->as.u64 = storage.u64; break;
        case GEA_CALL_FLOAT: result->as.f = storage.f; break;
        case GEA_CALL_DOUBLE: result->as.d = storage.d; break;
        case GEA_CALL_POINTER: result->as.ptr = storage.ptr; break;
        case GEA_CALL_STRING: result->as.str = static_cast<const char*>(storage.ptr); break;
        default: break;
    }
    return 0;
}

int32_t gea_ffi_closure_create(GeaCallKind return_kind,
                               const GeaCallKind* arg_kinds,
                               int32_t argc,
                               GeaFfiClosureCallback callback,
                               void* userdata,
                               void** out_function) {
    clearError();
    if (!callback || !out_function || argc < 0 || (argc > 0 && !arg_kinds)) {
        setError("invalid closure arguments");
        return -1;
    }
    ffi_type* result_type = typeFor(return_kind);
    if (!result_type) {
        setError("unsupported closure return kind %d", return_kind);
        return -4;
    }
    auto* context = new (std::nothrow) ClosureContext{};
    if (!context) {
        setError("out of memory allocating a closure");
        return -2;
    }
    context->callback = callback;
    context->userdata = userdata;
    context->arg_types = argc > 0 ? new (std::nothrow) ffi_type*[static_cast<size_t>(argc)] : nullptr;
    if (argc > 0 && !context->arg_types) {
        delete context;
        setError("out of memory allocating closure argument types");
        return -2;
    }
    for (int32_t i = 0; i < argc; ++i) {
        context->arg_types[i] = typeFor(arg_kinds[i]);
        if (!context->arg_types[i]) {
            delete[] context->arg_types;
            delete context;
            setError("unsupported closure argument kind %d", arg_kinds[i]);
            return -4;
        }
    }
    if (ffi_prep_cif(&context->cif, FFI_DEFAULT_ABI, static_cast<unsigned>(argc), result_type, context->arg_types) != FFI_OK) {
        delete[] context->arg_types;
        delete context;
        setError("ffi_prep_cif failed for the closure");
        return -3;
    }
    context->closure = static_cast<ffi_closure*>(ffi_closure_alloc(sizeof(ffi_closure), &context->code));
    if (!context->closure) {
        delete[] context->arg_types;
        delete context;
        setError("ffi_closure_alloc failed");
        return -2;
    }
    if (ffi_prep_closure_loc(context->closure, &context->cif, closureTrampoline, context, context->code) != FFI_OK) {
        ffi_closure_free(context->closure);
        delete[] context->arg_types;
        delete context;
        setError("ffi_prep_closure_loc failed");
        return -3;
    }
    g_closures[context->code] = context;
    *out_function = context->code;
    return 0;
}

void gea_ffi_closure_free(void* function) {
    if (!function) return;
    auto iterator = g_closures.find(function);
    if (iterator == g_closures.end()) return;
    ClosureContext* context = iterator->second;
    g_closures.erase(iterator);
    ffi_closure_free(context->closure);
    delete[] context->arg_types;
    delete context;
}

const char* gea_ffi_call_last_error(void) {
    return g_last_error;
}

void gea_ffi_call_clear_error(void) {
    clearError();
}

}

#else

extern "C" {

bool gea_ffi_call_available(void) {
    return false;
}

int32_t gea_ffi_call(void* function,
                     const GeaCallValue* args,
                     int32_t argc,
                     GeaCallValue* result) {
    (void)function;
    (void)args;
    (void)argc;
    (void)result;
    setError("this build has no libffi; generic native calls are unavailable");
    return -1;
}

int32_t gea_ffi_closure_create(GeaCallKind return_kind,
                               const GeaCallKind* arg_kinds,
                               int32_t argc,
                               GeaFfiClosureCallback callback,
                               void* userdata,
                               void** out_function) {
    (void)return_kind;
    (void)arg_kinds;
    (void)argc;
    (void)callback;
    (void)userdata;
    (void)out_function;
    setError("this build has no libffi; closures are unavailable");
    return -1;
}

void gea_ffi_closure_free(void* function) {
    (void)function;
}

const char* gea_ffi_call_last_error(void) {
    return g_last_error;
}

void gea_ffi_call_clear_error(void) {
    clearError();
}

}

#endif
