// SPDX-License-Identifier: Apache-2.0
/*
 * Bare-metal rv32imc registry test for QEMU virt.
 * UART0 is an NS16550 at 0x10000000; the SiFive test device exits the machine.
 */
#include "gea/ffi/gea_ffi.h"

#include <stddef.h>
#include <stdint.h>

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

volatile uint8_t* const UART = reinterpret_cast<volatile uint8_t*>(0x10000000);
volatile uint32_t* const TEST_DEVICE = reinterpret_cast<volatile uint32_t*>(0x100000);

void putChar(char c) {
    while ((UART[5] & 0x20) == 0) {}
    UART[0] = static_cast<uint8_t>(c);
}

void write(const char* text) {
    while (*text) putChar(*text++);
}

[[noreturn]] void exitQemu(uint32_t code) {
    register uintptr_t a0 asm("a0") = 0x18; // SYS_EXIT
    register uintptr_t a1 asm("a1") = code;
    asm volatile(
        "slli zero, zero, 0x1f\n"
        "ebreak\n"
        "srai zero, zero, 7\n"
        : : "r"(a0), "r"(a1) : "memory");
    (void)TEST_DEVICE;
    for (;;) {}
}

int add(int a, int b) { return a + b; }
int triple(int value) { return value * 3; }

} // namespace

extern "C" int main() {
    if (!gea_ffi_embedded_register("add", reinterpret_cast<void*>(&add))) {
        write("qemu_riscv failed: register\r\n");
        exitQemu(1);
    }
    if (!gea_ffi_embedded_register("triple", reinterpret_cast<void*>(&triple))) {
        write("qemu_riscv failed: triple\r\n");
        exitQemu(1);
    }
    const auto addFn = reinterpret_cast<int (*)(int, int)>(gea_ffi_embedded_lookup("add"));
    if (!addFn || addFn(19, 23) != 42) {
        write("qemu_riscv failed: add\r\n");
        exitQemu(1);
    }
    const auto tripleFn = reinterpret_cast<int (*)(int)>(gea_ffi_embedded_lookup("triple"));
    if (!tripleFn || tripleFn(14) != 42) {
        write("qemu_riscv failed: triple call\r\n");
        exitQemu(1);
    }
    if (!gea_ffi_embedded_unregister("add") || gea_ffi_embedded_has("add")) {
        write("qemu_riscv failed: unregister\r\n");
        exitQemu(1);
    }
    write("qemu_riscv ok\r\n");
    exitQemu(0);
}

extern "C" __attribute__((naked, section(".text.init"))) void _start() {
    asm volatile(
        "la sp, _stack_top\n"
        "call main\n"
        "li t0, 0x100000\n"
        "li t1, 0x5555\n"
        "sw t1, 0(t0)\n"
        "1: j 1b\n"
    );
}
