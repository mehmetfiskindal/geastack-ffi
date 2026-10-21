// SPDX-License-Identifier: Apache-2.0
/*
 * Bare-metal Cortex-M3 registry test for QEMU mps2-an385.
 * Uses ARM semihosting for output and exit; no C library is linked.
 */
#include "gea/ffi/gea_ffi.h"

#include <stddef.h>
#include <stdint.h>

extern "C" {
extern uint32_t _estack;
extern uint32_t _sidata;
extern uint32_t _sdata;
extern uint32_t _edata;
extern uint32_t _sbss;
extern uint32_t _ebss;

void Reset_Handler();
void Default_Handler() { for (;;) {} }
}

extern "C" void* memset(void* destination, int value, size_t count) {
    auto* bytes = static_cast<unsigned char*>(destination);
    for (size_t i = 0; i < count; ++i) bytes[i] = static_cast<unsigned char>(value);
    return destination;
}

extern "C" void* memcpy(void* destination, const void* source, size_t count) {
    auto* to = static_cast<unsigned char*>(destination);
    const auto* from = static_cast<const unsigned char*>(source);
    for (size_t i = 0; i < count; ++i) to[i] = from[i];
    return destination;
}

extern "C" void* memmove(void* destination, const void* source, size_t count) {
    auto* to = static_cast<unsigned char*>(destination);
    const auto* from = static_cast<const unsigned char*>(source);
    if (to < from) {
        for (size_t i = 0; i < count; ++i) to[i] = from[i];
    } else {
        for (size_t i = count; i > 0; --i) to[i - 1] = from[i - 1];
    }
    return destination;
}

namespace {

int semihost(int operation, void* argument) {
    register int r0 asm("r0") = operation;
    register void* r1 asm("r1") = argument;
    asm volatile("bkpt 0xAB" : "+r"(r0) : "r"(r1) : "memory");
    return r0;
}

void write0(const char* text) {
    semihost(0x04, const_cast<char*>(text));
}

[[noreturn]] void exitQemu(int code) {
    semihost(0x18, reinterpret_cast<void*>(static_cast<uintptr_t>(code)));
    for (;;) {}
}

int add(int a, int b) { return a + b; }
int triple(int value) { return value * 3; }

} // namespace

extern "C" void Reset_Handler() {
    uint32_t* source = &_sidata;
    for (uint32_t* destination = &_sdata; destination < &_edata;) *destination++ = *source++;
    for (uint32_t* destination = &_sbss; destination < &_ebss;) *destination++ = 0;

    const auto binary = reinterpret_cast<int (*)(int, int)>(gea_ffi_embedded_lookup("add"));
    if (!gea_ffi_embedded_register("add", reinterpret_cast<void*>(&add))) {
        write0("qemu_embedded failed: register\r\n");
        exitQemu(1);
    }
    if (gea_ffi_embedded_register("triple", reinterpret_cast<void*>(&triple)) == false) {
        write0("qemu_embedded failed: register triple\r\n");
        exitQemu(1);
    }
    if (!gea_ffi_embedded_has("add") || gea_ffi_embedded_count() != 2) {
        write0("qemu_embedded failed: registry state\r\n");
        exitQemu(1);
    }
    const auto addFn = reinterpret_cast<int (*)(int, int)>(gea_ffi_embedded_lookup("add"));
    if (!addFn || addFn(19, 23) != 42) {
        write0("qemu_embedded failed: add\r\n");
        exitQemu(1);
    }
    const auto tripleFn = reinterpret_cast<int (*)(int)>(gea_ffi_embedded_lookup("triple"));
    if (!tripleFn || tripleFn(14) != 42) {
        write0("qemu_embedded failed: triple\r\n");
        exitQemu(1);
    }
    if (!gea_ffi_embedded_unregister("add") || gea_ffi_embedded_has("add")) {
        write0("qemu_embedded failed: unregister\r\n");
        exitQemu(1);
    }
    if (gea_ffi_embedded_capacity() == 0) {
        write0("qemu_embedded failed: capacity\r\n");
        exitQemu(1);
    }
    (void)binary;
    write0("qemu_embedded ok\r\n");
    exitQemu(0);
}

extern "C" {
__attribute__((section(".isr_vector"), used))
const void* vector_table[] = {
    &_estack,
    reinterpret_cast<void*>(&Reset_Handler),
    reinterpret_cast<void*>(&Default_Handler),
};
}
