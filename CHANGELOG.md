# Changelog

All notable changes to `@geastack/ffi` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
