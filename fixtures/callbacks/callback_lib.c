// SPDX-License-Identifier: Apache-2.0
#include <stdint.h>

int32_t gea_apply_int(int32_t value, int32_t (*callback)(int32_t)) {
    return callback(value) * 2;
}

int32_t gea_apply_two(int32_t a, int32_t b, int32_t (*callback)(int32_t, int32_t)) {
    return callback(a, b);
}

int32_t gea_call_twice(int32_t (*callback)(int32_t)) {
    return callback(20) + callback(22);
}
