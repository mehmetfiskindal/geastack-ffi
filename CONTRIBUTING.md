# Contributing to @geastack/ffi

Thanks for taking the time to contribute. This document covers the local setup,
the checks a change has to pass, and the release checklist.

## Setup

```bash
nvm use            # Node 22 (see .nvmrc); package.json requires >= 20.19
npm ci             # installs dependencies and runs `prepare` (tsc build)
```

`koffi` ships prebuilt binaries, so the Node API needs no C toolchain. The C++
and platform tests need the toolchains listed by:

```bash
npm run doctor
```

## Repository layout

- `src/*.ts` — TypeScript API (host loader, memory, structs, platform bridges).
- `src/native/`, `include/gea/ffi/` — the C/C++/Objective-C++ library.
- `test/` — `node:test` suites that import the built `dist/` output.
- `scripts/` — build and platform verification scripts.
- `apps/`, `demos/`, `examples/` — samples; they are not part of the package.

`dist/` and `build/` are generated and git-ignored. Do not commit them.

## Required checks

```bash
npm run typecheck                 # tsc --noEmit
npm test                          # build + unit, mock, and host FFI tests
```

`npm test` covers the host platform. Run the native checks for the target you
touched, for example:

```bash
npm run test:callbacks            # callbacks (POSIX)
npm run test:apple-native         # macOS Objective-C backend
npm run test:ios                  # iOS cross-compile (macOS + Xcode)
npm run test:jni-native           # JNI (JDK)
npm run test:embedded-native      # embedded registry cross-compile
npm run test:dbus-native          # libdbus (Linux)
```

`npm run verify` runs the platform matrix for the current host and reports
skipped toolchains.

CI runs `typecheck` and `npm test` on Ubuntu, Windows, and macOS, plus the
platform-specific suites. A pull request is expected to be green there.

## Style

- TypeScript is strict. Prefer explicit types at module boundaries.
- Keep the SPDX header on new files.
- Format touched files with `npm run format` (Prettier). The repository is not
  formatted wholesale yet, so expect `npm run format` to touch more than your
  change; pass explicit file paths if you want a minimal diff.
- C/C++ follows the existing 4-space, `snake_case`-for-C-API style.

## Tests for bug fixes

Add a regression test that fails before the fix. For example, a fix to native
memory ownership belongs in `test/native-memory.test.mjs`, and a fix to
descriptor validation in `test/host-descriptor.test.mjs`.

Tests that load a real shared library must be guarded with
`{ skip: process.platform !== '...' }` so the suite still passes on the other
platforms.

## Versioning and release

`package.json` is the single source of truth for the version.
`npm run sync-version` propagates it to `src/version.ts` and `gea-plugin.json`;
`npm run check-version` fails when they drift (run by `prepublishOnly`).

Release checklist:

1. Update `CHANGELOG.md` and move entries out of `Unreleased`.
2. `npm version <patch|minor|major>` — this updates `package.json`, then run
   `npm run sync-version` and commit the generated files.
3. Tag the commit with the same `v<version>` string.
4. `npm publish` — `prepublishOnly` runs the version check, the typecheck, and
   the test suite; `prepare` builds `dist/` before packing.

## Reporting security issues

Do not open a public issue. See `SECURITY.md`.
