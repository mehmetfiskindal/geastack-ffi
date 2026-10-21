#import <Foundation/Foundation.h>
#include <stdio.h>

extern "C" void* gea_ffi_block_create(void* invoke);

static int g_count = 0;

static void invoke(void* block, void* object, unsigned long index, unsigned char* stop) {
    (void)block;
    (void)object;
    (void)stop;
    g_count += (int)index + 1;
}

int main() {
    @autoreleasepool {
        NSMutableArray* array = [NSMutableArray array];
        [array addObject:@"a"];
        [array addObject:@"b"];
        void* block = gea_ffi_block_create((void*)invoke);
        if (!block) return 2;
        [array enumerateObjectsUsingBlock:(__bridge void (^)(id, NSUInteger, BOOL*))block];
        printf("block_count=%d\n", g_count);
        return g_count == 3 ? 0 : 1;
    }
}
