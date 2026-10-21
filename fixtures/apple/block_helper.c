// SPDX-License-Identifier: Apache-2.0
#include <stdint.h>
#include <stdlib.h>

/*
 * Minimal global block layout for macOS/iOS.
 * The invoke function receives the block itself as its hidden first argument.
 */
extern char _NSConcreteGlobalBlock;

struct GeaBlockDescriptor {
    unsigned long reserved;
    unsigned long size;
};

struct GeaBlockLayout {
    void* isa;
    int32_t flags;
    int32_t reserved;
    void* invoke;
    struct GeaBlockDescriptor* descriptor;
};

static struct GeaBlockDescriptor g_descriptor = {
    0,
    sizeof(struct GeaBlockLayout),
};

void* gea_ffi_block_create(void* invoke) {
    if (!invoke) return NULL;
    struct GeaBlockLayout* block = (struct GeaBlockLayout*)calloc(1, sizeof(struct GeaBlockLayout));
    if (!block) return NULL;
    block->isa = (void*)&_NSConcreteGlobalBlock;
    block->flags = 0x10000000; /* BLOCK_IS_GLOBAL */
    block->invoke = invoke;
    block->descriptor = &g_descriptor;
    return block;
}

void gea_ffi_block_free(void* block) {
    free(block);
}
