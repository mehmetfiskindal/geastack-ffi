// SPDX-License-Identifier: Apache-2.0
/**
 * @geastack/ffi - GeaStack Compiler Extension Plugin
 * Plugs into @geastack/compiler (geatsc) to handle FFI symbols and C++ AOT emissions.
 */

export interface GeaCompilerPlugin {
  readonly name: string;
  readonly version: string;
  readonly headers: readonly string[];
  readonly nativeSources: readonly string[];
  readonly definitions?: readonly {
    condition: string | null;
    definition: string;
  }[];
}

/**
 * Creates the compiler plugin descriptor for @geastack/ffi.
 */
export function createFfiCompilerPlugin(): GeaCompilerPlugin {
  return {
    name: '@geastack/ffi',
    version: '0.1.0',
    headers: [
      'gea/ffi/gea_ffi.h',
      'gea/ffi/gea_ffi_types.h',
      'gea/ffi/gea_ffi_registry.h',
    ],
    nativeSources: [
      'src/native/gea_ffi_core.cpp',
      'src/native/gea_ffi_embedded.cpp',
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
