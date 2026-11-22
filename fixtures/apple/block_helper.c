// SPDX-License-Identifier: Apache-2.0
#include <Block.h>
#include <pthread.h>
#include <stdint.h>
#include <stdlib.h>

/*
 * Reference-counted Objective-C malloc block helper for macOS/iOS.
 *
 * Builds a stack block with BLOCK_HAS_COPY_DISPOSE and copies it through
 * _Block_copy() into a runtime-managed _NSConcreteMallocBlock. Foundation and
 * GCD APIs that retain/copy the block increment its real reference count; the
 * dispose helper records the invoke pointer only when the final _Block_release()
 * drops the refcount to zero so the host can unregister its koffi trampoline
 * without a use-after-free.
 */
extern void* _NSConcreteStackBlock[32];

#define GEA_BLOCK_HAS_COPY_DISPOSE (1 << 25)

struct GeaBlockDescriptor {
    unsigned long reserved;
    unsigned long size;
    void (*copy_helper)(void* dst, const void* src);
    void (*dispose_helper)(const void* src);
};

struct GeaBlockLayout {
    void* isa;
    int32_t flags;
    int32_t reserved;
    void* invoke;
    struct GeaBlockDescriptor* descriptor;
};

static pthread_mutex_t g_disposed_mutex = PTHREAD_MUTEX_INITIALIZER;
static void** g_disposed_invokes = NULL;
static size_t g_disposed_count = 0;
static size_t g_disposed_capacity = 0;

static void gea_block_copy_helper(void* dst, const void* src) {
    (void)dst;
    (void)src;
}

static void gea_block_dispose_helper(const void* src) {
    const struct GeaBlockLayout* block = (const struct GeaBlockLayout*)src;
    if (!block || !block->invoke) return;

    pthread_mutex_lock(&g_disposed_mutex);
    if (g_disposed_count == g_disposed_capacity) {
        size_t next_capacity = g_disposed_capacity == 0 ? 16 : g_disposed_capacity * 2;
        void** next = (void**)realloc(g_disposed_invokes, next_capacity * sizeof(void*));
        if (next) {
            g_disposed_invokes = next;
            g_disposed_capacity = next_capacity;
        }
    }
    if (g_disposed_count < g_disposed_capacity) {
        g_disposed_invokes[g_disposed_count++] = block->invoke;
    }
    pthread_mutex_unlock(&g_disposed_mutex);
}

static struct GeaBlockDescriptor g_descriptor = {
    0,
    sizeof(struct GeaBlockLayout),
    gea_block_copy_helper,
    gea_block_dispose_helper,
};

void* gea_ffi_block_create(void* invoke) {
    if (!invoke) return NULL;
    struct GeaBlockLayout stack_block;
    stack_block.isa = (void*)_NSConcreteStackBlock;
    stack_block.flags = GEA_BLOCK_HAS_COPY_DISPOSE;
    stack_block.reserved = 0;
    stack_block.invoke = invoke;
    stack_block.descriptor = &g_descriptor;
    return _Block_copy(&stack_block);
}

void gea_ffi_block_free(void* block) {
    if (!block) return;
    _Block_release(block);
}

int32_t gea_ffi_block_drain_disposed(void** out, int32_t capacity) {
    if (!out || capacity <= 0) return 0;
    pthread_mutex_lock(&g_disposed_mutex);
    size_t to_copy = g_disposed_count < (size_t)capacity ? g_disposed_count : (size_t)capacity;
    for (size_t i = 0; i < to_copy; ++i) {
        out[i] = g_disposed_invokes[i];
    }
    size_t remaining = g_disposed_count - to_copy;
    for (size_t i = 0; i < remaining; ++i) {
        g_disposed_invokes[i] = g_disposed_invokes[to_copy + i];
    }
    g_disposed_count = remaining;
    pthread_mutex_unlock(&g_disposed_mutex);
    return (int32_t)to_copy;
}
