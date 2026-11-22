# Changelog

All notable changes to `@developersailor/geastack-ffi` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.1] - 2026-11-22

### Fixed

- `NativeMemory.free()` now revokes the pointer from the native pointer registry
  to prevent use-after-free on subsequent reads, writes, or native calls.
- Apple native Objective-C blocks (`gea_ffi_apple.mm`, `block_helper.c`,
  `src/apple/block.ts`) now use reference-counted `_NSConcreteMallocBlock`
  copies via `_Block_copy`/`_Block_release` instead of heap-allocated
  `BLOCK_IS_GLOBAL` structs, preventing use-after-free when Foundation or GCD
  retains a block past `releaseNativeBlock()`.
- `gea_ffi_dbus.cpp` rejects non-string dictionary keys (`a{uv}`, `a{iv}`),
  validates D-Bus object paths and empty array signatures, abandons open
  libdbus containers on error paths, frees partial allocations on failure,
  uses `std::call_once` for `dbus_threads_init_default()`, and exposes
  `gea_ffi_dbus_free_value()` in `gea_ffi_dbus.h`.
- `src/linux/index.ts` binds POSIX `open()` and `ioctl()` as variadic functions
  (fixing Darwin ARM64 PCS) and uses macOS-specific `O_CREAT`/`O_TRUNC` flags.
- `src/linux/dbus-native.ts` computes pointer strides via `koffi.sizeof('void *')`
  instead of hardcoding 8 bytes, and frees native D-Bus reply/signal values on
  error paths.
- `src/host-backend.ts` marshals `StructInstance` pointer fields, supports
  passing `NativeStructInstance` directly, marshals pointer/int64/struct
  callback arguments and return values, validates arity, and keys bindings by
  binding name to prevent duplicate symbol overwrites.
- `gea_ffi_android.cpp` automatically detaches auto-attached native threads on
  thread exit and synchronizes `s_javaVM`/`s_globalContext` without
  self-assignment use-after-free.
- `gea_ffi_call.cpp` synchronizes `g_closures`, guards `extern "C"` boundaries
  against allocation exceptions, and rejects `GEA_CALL_VOID` arguments.
- `gea_ffi_core.cpp` stores `g_last_error` in `thread_local` storage and guards
  closed handles and null symbol lookups.

### Added

- Restored the GitHub Actions CI workflow (removed in `90318ab`) and extended it
  with a typecheck step and a package-contents job.
- `.github/dependabot.yml` for npm and GitHub Actions updates.
- `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `CODEOWNERS`,
  `CHANGELOG.md`, `.editorconfig`, `.nvmrc`, and `.gitattributes`.
- `npm run lint` (TypeScript typecheck) and `npm run format` (Prettier).
- `CallbackHandle.isReleased()`.
- `NativeMemory.free()` now tracks ownership of every `alloc()` result.
- `VERSION` export, backed by `src/version.ts`, plus `npm run sync-version` and
  `npm run check-version` so `package.json` stays the single source of truth.
- `main`, `types`, and `sideEffects` fields, and JavaScript source maps in the
  published tarball.

### Changed

- Renamed the package from `@geastack/ffi` to `@developersailor/geastack-ffi`.
  The `@geastack` npm scope is owned by a different account, so publishing under
  it would fail. Imports, the GeaStack plugin name, the sample apps, and the
  documentation were updated; the GitHub repository URL is unchanged.
- Helper shared libraries (D-Bus, DConf, Apple block) are resolved relative to
  the package root instead of `process.cwd()`. `GEA_FFI_DBUS_LIBRARY`,
  `GEA_FFI_DCONF_LIBRARY`, and `GEA_FFI_APPLE_BLOCK_LIBRARY` still override the
  lookup. Loading from the launch directory let a planted library run in-process.
- `dist/`, `build/`, `.cache/`, and `compile_commands.json` are no longer
  tracked; they are rebuilt by `npm run prepare`/`npm test` and the `build:*`
  scripts. `src/native/compile_commands.json` (a broken symlink) was removed.
- `npm run prepare` builds the package, and `npm run prepublishOnly` runs the
  version check and the test suite before publishing.
- `test:mock` and `test:native` build first, so they no longer depend on a
  previously generated `dist/`.
- `.clangd` and `.vscode/c_cpp_properties.json` no longer hardcode an absolute
  checkout path.

### Fixed

- Passing a released `CallbackHandle` to a native call now throws instead of
  forwarding a freed koffi slot. This matches the documented behaviour.
- `NativeMemory.free()` rejects pointers it did not allocate and double frees,
  instead of passing an arbitrary address to `koffi.free()`.
- `descriptor.async` and unsupported `FunctionDescriptor.abi` values
  (`win64`, `sysv64`) now throw when the library is opened instead of being
  silently ignored.

## [0.1.0]

Initial public version.
