# Sailfish OS FFI demo

Native console demo for Sailfish OS. It exercises the real Linux/Sailfish
backend without a Node host or the GeaStack SDK runtime:

- `libc.so.6` through `dlopen`/`dlsym`: `getpid`, `strlen`, `gettimeofday`,
  `malloc`/`free`
- Sailjail XDG data directory from `gea_ffi_sailfishos`
- `/usr/share/<app>` package directory
- libdbus session calls: `GetId`, `NameHasOwner`, unique bus name

## Run on a Sailfish device

Install a C++ toolchain, CMake, pkg-config, and the libdbus development headers
(or build from the Sailfish SDK against the target sysroot), then:

```sh
cd demos/sailfishos-ffi
./build.sh
```

The script configures CMake, builds `src/native/` as a static library, links the
demo, and runs it. If no session bus is available, the D-Bus checks are skipped
and the libc/path checks still run.

## Run with the Sailfish SDK

Create a CMake project from this directory, select the SailfishOS target, and
build `gea-sailfish-demo`. `CMakeLists.txt` compiles the library sources
directly, so no extra package layout is required. `GEA_FFI_DBUS` is compiled
and linked automatically when `pkg-config dbus-1` resolves.

## Expected output

```text
@geastack/ffi Sailfish OS demo

[ok]   libc.so.6 getpid: 12345
[ok]   libc.so.6 strlen("geastack"): 8
[ok]   libc.so.6 gettimeofday: time is set
[ok]   libc.so.6 malloc/free
[ok]   Sailjail data directory: /home/defaultuser/.local/share/com.geastack/harbour-geaffi
[ok]   Sailfish package share directory: /usr/share/harbour-geaffi
[ok]   D-Bus session connection: :1.0
[ok]   D-Bus GetId: ...
[ok]   D-Bus NameHasOwner: true

sailfish_demo ok
```

Exit code is 0 when all checks pass, 1 otherwise.

## Notes

- This demo uses the session bus. Sailfish system services such as MCE and NGFD
  live on the system bus; pass `1` to `gea_ffi_dbus_connect` for those. They are
  not queried here because the services and policies differ between devices.
- `apps/sailfishos-ffi` remains the GeaStack JSX/CSS GUI demo. This console demo
  verifies the native C++ path that the GUI app sits on top of.
