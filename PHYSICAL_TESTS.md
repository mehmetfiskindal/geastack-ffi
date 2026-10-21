# Physical and external validation

The automated suite covers the host, simulators, emulators, QEMU, and Wine.
Use this checklist for the remaining real-device runs and send back the
complete console output for each item.

## Windows PC

```bat
cd geastack-ffi\demos\windows-ffi
run.cmd
```

Expected final lines:

```text
54/54 checks passed
windows_demo ok
```

The demo covers `kernel32`, `user32`, `ucrtbase`, `advapi32` registry
read/write/delete/enumerate (including QWORD/BINARY/MULTI_SZ/EXPAND_SZ),
`ole32` COM initialization, ShellLink vtable calls, named COM methods, and
`IStream` byte-buffer Read/Write/Seek.

## Sailfish OS device

Build and run the libc/XDG/libdbus demo on the device:

```sh
cd geastack-ffi/demos/sailfishos-ffi
./build.sh
```

Expected final line:

```text
sailfish_demo ok
```

The native MCE/NGFD/DConf paths are host-tested against mock services. On a
real device, `MCE.nativeAvailable` / `NGFD` / `DConf.nativeAvailable` should be
true when the host libdbus/libdconf bridges are built.

## Android physical device

Connect the device with USB debugging enabled and run:

```sh
npm run test:android-device
```

Expected final lines:

```text
bridgeAdd=42
bridgeGreet=hello GeaStack
android_jni_runtime ok
```

This pushes the arm64 JNI fixture to `/data/local/tmp` and runs it through
`app_process`/ART; it does not boot an emulator.

## iOS

Simulator (already automated on macOS):

```sh
npm run test:ios-sim
```

Expected:

```text
ios_sim_test ok
ios sim ok
```

A physical iPhone needs a signed app. Build the archive with:

```sh
npm run test:ios
```

and run the app with a development team/profile; the native test executable
cannot be installed unsigned.

## Embedded hardware

QEMU checks are automated:

```sh
npm run test:embedded-qemu
npm run test:embedded-riscv
```

Expected:

```text
qemu_embedded ok
qemu_riscv ok
```

Physical Cortex-M/ESP32/RISC-V boards are not automated here; flash the
registry fixture with the board SDK and report the serial output.

## What to send back

For each run, send:

1. the exact command,
2. the complete console output,
3. the OS/device version (for example `Windows 11 24H2`, Sailfish build, Android
   model/API level, iPhone model/iOS version).

Do not include credentials or signing secrets. The expected outputs above are
the acceptance criteria for closing the remaining platform checklist.
