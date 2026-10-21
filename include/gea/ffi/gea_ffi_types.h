// SPDX-License-Identifier: Apache-2.0
#pragma once

#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>

#ifdef __cplusplus
namespace gea::ffi {

enum class TypeKind : uint8_t {
    Void = 0,
    Bool,
    Int8,
    Uint8,
    Int16,
    Uint16,
    Int32,
    Uint32,
    Int64,
    Uint64,
    Float,
    Double,
    Pointer,
    String,
    WString,
    Buffer,
    Struct
};

struct Value {
    TypeKind kind;
    union {
        bool b;
        int8_t i8;
        uint8_t u8;
        int16_t i16;
        uint16_t u16;
        int32_t i32;
        uint32_t u32;
        int64_t i64;
        uint64_t u64;
        float f;
        double d;
        void* ptr;
        const char* str;
        const wchar_t* wstr;
        struct {
            uint8_t* data;
            size_t length;
        } buffer;
    } as;

    Value() : kind(TypeKind::Void) { as.ptr = nullptr; }
    explicit Value(bool val) : kind(TypeKind::Bool) { as.b = val; }
    explicit Value(int32_t val) : kind(TypeKind::Int32) { as.i32 = val; }
    explicit Value(uint32_t val) : kind(TypeKind::Uint32) { as.u32 = val; }
    explicit Value(int64_t val) : kind(TypeKind::Int64) { as.i64 = val; }
    explicit Value(uint64_t val) : kind(TypeKind::Uint64) { as.u64 = val; }
    explicit Value(float val) : kind(TypeKind::Float) { as.f = val; }
    explicit Value(double val) : kind(TypeKind::Double) { as.d = val; }
    explicit Value(void* val) : kind(TypeKind::Pointer) { as.ptr = val; }
    explicit Value(const char* val) : kind(TypeKind::String) { as.str = val; }
    explicit Value(const wchar_t* val) : kind(TypeKind::WString) { as.wstr = val; }
};

} // namespace gea::ffi
#endif
