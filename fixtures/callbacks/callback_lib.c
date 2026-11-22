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

static int32_t (*g_stored_callback)(int32_t) = 0;

void gea_store_callback(int32_t (*callback)(int32_t)) {
    g_stored_callback = callback;
}

int32_t gea_fire_callback(int32_t value) {
    return g_stored_callback ? g_stored_callback(value) : -1;
}

void* gea_apply_ptr(void* value, void* (*callback)(void*)) {
    return callback ? callback(value) : 0;
}

int64_t gea_apply_i64(int64_t value, int64_t (*callback)(int64_t)) {
    return callback ? callback(value) : -1;
}

typedef struct GeaPtrBox {
    void* ptr;
    int32_t tag;
} GeaPtrBox;

int32_t gea_swap_box_ptr(GeaPtrBox* box, void* replacement) {
    if (!box) return -1;
    int32_t had_ptr = box->ptr != 0 ? 1 : 0;
    box->ptr = replacement;
    box->tag += 10;
    return had_ptr;
}
