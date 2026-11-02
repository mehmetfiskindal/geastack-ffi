# Security Policy

## Supported versions

`@geastack/ffi` is pre-1.0. Only the latest `0.x` release receives security
fixes.

## Reporting a vulnerability

Please do **not** open a public issue for a security problem.

Report it privately through GitHub's
[security advisory form](https://github.com/mehmetfiskindal/geastack-ffi/security/advisories/new)
or by email to the maintainer listed in `package.json`. Include the affected
version, the platform, a minimal reproducer, and the impact you observed.

You can expect an acknowledgement within a few days. Once a fix is available
the advisory is published together with a patched release.

## Scope and threat model

This package loads and calls native code by design, so the following are **not**
vulnerabilities by themselves:

- A caller loading a library that it names itself, including one it built
  maliciously. `Library.open()` is the documented way to run arbitrary native
  code in-process.
- A crash caused by a wrong `FunctionDescriptor`, a wrong struct layout, or a
  pointer the caller constructed by hand.

Things that **are** in scope:

- The library loading a `.so`/`.dylib` from a location the caller did not
  choose, for example a helper library picked up from the current working
  directory. Helper libraries are resolved relative to the package root and can
  be overridden with `GEA_FFI_DBUS_LIBRARY`, `GEA_FFI_DCONF_LIBRARY`, and
  `GEA_FFI_APPLE_BLOCK_LIBRARY`.
- Simulated-heap pointers reaching native code. `requireNativeAddress()` is the
  guard; any path that bypasses it is a bug.
- Use-after-free through released `CallbackHandle` values, `NativeMemory.free()`
  on foreign pointers, or a released `DynamicLibrary`.
- Dependency vulnerabilities in `koffi` or the published tarball.

## Hardening checklist for consumers

- Do not pass user-controlled paths to `Library.open()`.
- Keep `NativeMemory` allocations and `CallbackHandle` releases paired in
  `try`/`finally` blocks.
- Run the host process with the least privilege it needs; an FFI call inherits
  the process permissions.
