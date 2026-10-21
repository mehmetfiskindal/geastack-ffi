// SPDX-License-Identifier: Apache-2.0
/**
 * @geastack/ffi - GeaStack Compiler Extension Plugin
 * Plugs into @geastack/compiler (geatsc) to handle FFI symbols and C++ AOT emissions.
 */
/**
 * Creates the compiler plugin descriptor for @geastack/ffi.
 */
export function createFfiCompilerPlugin() {
    return {
        name: '@geastack/ffi',
        version: '0.1.0',
        headers: [
            'gea/ffi/gea_ffi.h',
            'gea/ffi/gea_ffi_types.h',
            'gea/ffi/gea_ffi_registry.h',
            'gea/ffi/gea_ffi_windows.h',
            'gea/ffi/gea_ffi_linux.h',
            'gea/ffi/gea_ffi_sailfishos.h',
            'gea/ffi/gea_ffi_apple.h',
            'gea/ffi/gea_ffi_android.h',
            'gea/ffi/gea_ffi_dbus.h',
            'gea/ffi/gea_ffi_call.h',
            'gea/ffi/gea_ffi_dconf.h',
        ],
        nativeSources: [
            'src/native/gea_ffi_core.cpp',
            'src/native/gea_ffi_embedded.cpp',
            'src/native/gea_ffi_windows.cpp',
            'src/native/gea_ffi_linux.cpp',
            'src/native/gea_ffi_sailfishos.cpp',
            'src/native/gea_ffi_apple.mm',
            'src/native/gea_ffi_android.cpp',
            'src/native/gea_ffi_dbus.cpp',
            'src/native/gea_ffi_call.cpp',
            'src/native/gea_ffi_dconf.cpp',
        ],
        definitions: [
            {
                condition: null, // Emit into every unit that references @geastack/ffi
                definition: `#include "gea/ffi/gea_ffi.h"\n`,
            },
        ],
    };
}
export default createFfiCompilerPlugin;
//# sourceMappingURL=index.js.map