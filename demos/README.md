# Demos for the other machines

These demos are self-contained checks for the two targets that this workspace
does not execute: Windows x64 and Sailfish OS. Run one on the corresponding
machine and send back the terminal output.

| Target | Demo | Command |
| --- | --- | --- |
| Windows x64 | Win32 + COM + heap + structs | `demos\windows-ffi\run.cmd` |
| Sailfish OS | libc + Sailjail paths + libdbus | `demos/sailfishos-ffi/build.sh` |

## Windows

Requirements: Windows x64, Node.js 20.19 or newer, npm.

```bat
cd demos\windows-ffi
run.cmd
```

`run.cmd` installs dependencies and builds `dist/` if needed, then runs
`demo.mjs`. PowerShell users can run `.\run.ps1`.

The demo loads `kernel32.dll`, `user32.dll`, `ucrtbase.dll`, `advapi32.dll`,
and `ole32.dll` with `{ backend: 'native' }`. It checks process id,
`FILETIME`/`SYSTEMTIME`, native heap allocation, UTF-16 `GetFileAttributesW`,
`GetTickCount64`, `GetACP`, `CoInitializeEx`, `CoCreateGuid`, and a temporary
registry write/read/delete round-trip. Expected final line: `windows_demo ok`.

It also runs under Wine for CI-like checks:

```bash
npm run test:windows-wine
```

Wine passes 50/50, but that is a compatibility smoke test; the real Windows PC
run is still the authoritative one.

## Sailfish OS

Requirements: a Sailfish device or SDK, C++17 compiler, CMake, pkg-config, and
libdbus development files.

```sh
cd demos/sailfishos-ffi
./build.sh
```

The demo links the native library from `src/native/`, calls `libc.so.6`
directly, prints the Sailjail data/share paths, and talks to the session bus.
If no bus is available, it reports D-Bus as skipped. Expected final line:
`sailfish_demo ok`.

The GeaStack GUI version is still `apps/sailfishos-ffi`; build it with the
GeaStack CLI for a phone UI.

## What each demo proves

- Both demos use real shared-library calls; they do not register mocks.
- Windows exercises the koffi host backend and the Windows x64 struct ABI.
- Sailfish exercises `dlopen`/`dlsym`, the XDG helpers, and libdbus.
- Neither demo is run by this workspace's CI. The output from your machine is
  the runtime evidence for those targets.
