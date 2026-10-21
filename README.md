# @geastack/ffi

Call C shared libraries from Node, and build the small C++ loader used by GeaStack native targets.

Version 0.1.0. The Node host loader is verified on Windows x64, Linux x64, and macOS arm64. The Apple Objective-C backend is live on macOS, runs on the iOS simulator, and cross-compiles for iOS device. Android, embedded, Linux D-Bus, and Windows registry have native backends. The TypeScript Android, Sailfish, and embedded helpers and the named-method Windows COM dispatcher remain in-process simulations; native COM objects can use callVTable.

## Installation

Requires Node.js 20.19 or newer.

```bash
npm install @geastack/ffi
```

The install pulls `koffi`, which provides the native calls for `Library.open()` on the host. No extra compiler is required for the Node API.

## Working example

`Library.open()` loads a real shared library. A missing file or a missing symbol throws. The calls below were executed; they are not placeholder return values.

### Windows x64

Verified on this machine with Node.js 24.21 against `kernel32.dll` and `ucrtbase.dll`.

```typescript
import { Library, defineStruct } from '@geastack/ffi';

const FileTime = defineStruct('FILETIME', {
  dwLowDateTime: 'uint32',
  dwHighDateTime: 'uint32',
});

const kernel32 = Library.open('kernel32.dll', {
  GetCurrentProcessId: { args: [], returns: 'uint32' },
  GetSystemTimeAsFileTime: { args: [FileTime], returns: 'void' },
});

console.log(kernel32.symbols.GetCurrentProcessId()); // current process id

const fileTime = FileTime.alloc();
kernel32.symbols.GetSystemTimeAsFileTime(fileTime);
console.log(fileTime.get('dwLowDateTime'), fileTime.get('dwHighDateTime'));
fileTime.free();
kernel32.close();
```

`fileTime.free()` releases the JavaScript staging buffer used to present the struct. It is not `HeapFree`. The native allocation test calls `HeapAlloc` and `HeapFree` on the process heap and checks that `HeapFree` returns 1.

### Linux x64

Verified under Kali Linux (glibc, g++ 16.2) in WSL, Node.js 24.19, against `libc.so.6` and `libm.so.6`.

```typescript
import { Library, defineStruct } from '@geastack/ffi';

const Timeval = defineStruct('timeval', {
  tv_sec: 'int64',
  tv_usec: 'int64',
});

const libc = Library.open('libc.so.6', {
  getpid: { args: [], returns: 'int32' },
  strlen: { args: ['string'], returns: 'uint64' },
  gettimeofday: { args: [Timeval, 'pointer'], returns: 'int32' },
  malloc: { args: ['uint64'], returns: 'pointer' },
  free: { args: ['pointer'], returns: 'void' },
});

const libm = Library.open('libm.so.6', {
  cos: { args: ['double'], returns: 'double' },
  pow: { args: ['double', 'double'], returns: 'double' },
});

console.log(libc.symbols.getpid());            // process pid
console.log(libc.symbols.strlen('geastack'));   // 8n
console.log(libm.symbols.cos(0));               // 1
console.log(libm.symbols.pow(2, 8));            // 256

const now = Timeval.alloc();
libc.symbols.gettimeofday(now, null);
now.free();

const block = libc.symbols.malloc(64n);
libc.symbols.free(block);
libc.close();
libm.close();
```

`libm.so.6` is the Linux soname. `Library.open('libm')` looks for `libm.so`, which is a different filename.

### macOS arm64

Verified on macOS 27.0 (Xcode 27, clang 21) with Node.js 22.23 and the system `libSystem.B.dylib`. macOS is the reference implementation for the iOS build: both use the same dyld and Objective-C runtime.

```typescript
import { Library, defineStruct, ObjC, Pointer } from '@geastack/ffi';

const DarwinTimeval = defineStruct('darwin_timeval', {
  tv_sec: 'int64',
  tv_usec: 'int32', // suseconds_t is 32-bit; the struct is still 16 bytes
});

const libSystem = Library.open('libSystem.B.dylib', {
  getpid: { args: [], returns: 'int32' },
  gettimeofday: { args: [DarwinTimeval, 'pointer'], returns: 'int32' },
  strlen: { args: ['string'], returns: 'uint64' },
  cos: { args: ['double'], returns: 'double' },
});

console.log(libSystem.symbols.getpid());       // process pid
console.log(libSystem.symbols.strlen('geastack')); // 8n
console.log(libSystem.symbols.cos(0));         // 1

const now = DarwinTimeval.alloc();
console.log(libSystem.symbols.gettimeofday(now, null)); // 0
console.log(now.get('tv_sec'), now.get('tv_usec'));
now.free();

const NSString = ObjC.getClass('NSString');
const text = ObjC.send(NSString, 'stringWithUTF8String:', { args: ['string'], returns: 'id' }, 'geastack');
console.log(ObjC.send(text, 'UTF8String', { args: [], returns: 'string' })); // 'geastack'
console.log(ObjC.send(text, 'length', { args: [], returns: 'ulong' }));      // 8n
libSystem.close();
```

`ObjC.runtimeAvailable` is `true` on this host. `ObjC.send` needs an explicit signature because Objective-C does not record argument types at runtime. `ObjC.getClass` returns real runtime classes and falls back to simulated references for classes that are not loaded (for example UIKit classes on macOS).

### iOS

`npm run test:ios` compiles `src/native/gea_ffi_core.cpp`, `gea_ffi_apple.mm`, and a consumer against the `iphonesimulator` (arm64 and x86_64) and `iphoneos` (arm64) SDKs. It produces `build/ios-native/<sdk>-<arch>/libgea_ffi.a` and checks the exported symbols.

`npm run test:ios-sim` builds the same native sources as a simulator executable, boots an available iPhone simulator, and runs `fixtures/apple/ios_sim_test.mm` through `xcrun simctl spawn`. It checks live `NSString`, `NSProcessInfo`, UTF-8 conversion, nil messaging, release, and `dlopen("libSystem.B.dylib")`. This is a real run on the iOS simulator runtime; a physical device still requires a signed app.

## Demos

Two demos target machines this workspace does not run:

```bash
# Windows x64 (Node 20.19+)
demos\windows-ffi\run.cmd

# Sailfish OS (C++17, CMake, libdbus)
demos/sailfishos-ffi/build.sh
```

The Windows demo calls `kernel32.dll`, `user32.dll`, `ucrtbase.dll`,
`advapi32.dll`, and `ole32.dll` through the native host backend, including
`FILETIME`/`SYSTEMTIME`, `HeapAlloc`/`HeapFree`, `GetFileAttributesW`,
`CoCreateGuid`, `ShellLink` `AddRef`/`Release`/`QueryInterface`, and a registry
write/read/delete round-trip. `npm run test:windows-wine` runs the same demo
under Wine 7.7 (26/26 checks); that is a smoke test, not a native Windows run. The Sailfish demo links
`src/native/`, calls `libc.so.6` through `dlopen`, prints Sailjail paths, and
queries the session bus with libdbus. See [demos/README.md](demos/README.md) for
expected output and prerequisites.

## API reference

### Library.open(path, functions, options?)

Loads a shared library and binds each descriptor. On Windows a bare name such as `kernel32` becomes `kernel32.dll`. On Linux and Android a bare name such as `sqlite3` becomes `libsqlite3.so`. A path, or a name that already has `.dll`, `.dylib`, or `.so`, is left unchanged.

```typescript
const libc = Library.open('libc.so.6', {
  strlen: {
    args: ['string'],
    returns: 'uint64',
    symbol: 'strlen', // optional; defaults to the property name
  },
});

libc.getSymbolAddress('strlen'); // address of the loaded symbol
libc.close();                     // further calls throw
```

`options.backend`:

| Value | Behavior |
| --- | --- |
| `auto` (default) | If `registerMockFunction` was used for this library name, call those mocks. Otherwise load the shared library. |
| `native` | Always load the shared library. |
| `mock` | Never load a shared library. Unregistered functions return a zero, empty string, or other placeholder. |

Argument and return types: `void`, `bool`, `int8`, `uint8`, `int16`, `uint16`, `int32`, `uint32`, `int64`, `uint64`, `float`, `double`, `pointer`, `string`, `wstring`, `buffer`, and a struct definition.

- `string` is a null-terminated UTF-8 C string. Pass a JavaScript string.
- `int64` and `uint64` use `bigint`.
- `bool` is a one-byte C `_Bool`, not the four-byte Win32 `BOOL`. Use `int32` for `BOOL`.
- A struct in `args` is passed as a pointer. A struct in `returns` is returned by value.
- `pointer` arguments must be `null` or a `Pointer` previously returned by a native call. Addresses from `Memory.alloc()` are not native addresses and are rejected.
- Callback types are rejected by the host loader.

Opening a library compares each struct's size and field offsets with the host ABI. A mismatch throws before the call.

### defineStruct(name, fields)

Computes C layout, including padding. `alloc()` creates a staging instance. `get`, `set`, `toObject`, `assign`, and `free` read and write that staging buffer. When the instance is passed to a native function, its fields are copied into native memory for the call and copied back afterward.

Verified layouts:

| Struct | Host | Size | Field offsets |
| --- | --- | --- | --- |
| `FILETIME` `{ dwLowDateTime: uint32, dwHighDateTime: uint32 }` | Windows x64 | 8 | 0, 4 |
| `SYSTEMTIME` eight `uint16` fields | Windows x64 | 16 | 0 through 14 |
| `timeval` `{ tv_sec: int64, tv_usec: int64 }` | Linux x64 glibc | 16 | 0, 8 |
| `darwin_timeval` `{ tv_sec: int64, tv_usec: int32 }` | macOS arm64 | 16 | 0, 8 |

### Memory

`Memory.alloc`, `Memory.free`, `read`/`write` primitives, and C-string helpers address a simulated heap inside the process. They are for staging and for tests. They do not call `malloc` or `HeapAlloc`.

To allocate and release native memory, bind the platform functions and call them, as the `malloc`/`free` and `HeapAlloc`/`HeapFree` examples do.

### registerMockFunction(library, symbol, fn)

Registers an in-process replacement. Mock tests live in `test/mock/` and do not load a shared library. Host tests live in `test/native/` and pass `{ backend: 'native' }`.

### ObjC (macOS host)

`ObjC.runtimeAvailable` reports whether the live Objective-C runtime loaded. On macOS the bridge uses `objc_getClass`, `sel_registerName`, and `objc_msgSend`; on other platforms it keeps the deterministic simulation.

```typescript
ObjC.getClass('NSString');        // real Class pointer when registered
ObjC.send(NSString, 'stringWithUTF8String:', { args: ['string'], returns: 'id' }, 'hello');
ObjC.send(text, 'UTF8String', { args: [], returns: 'string' });
ObjC.sendClass('NSProcessInfo', 'processInfo', { args: [], returns: 'id' });
ObjC.toNSString('hello');         // +1 retained NSString; release with ObjC.release()
ObjC.fromNSString(text);          // 'hello'
ObjC.objectClassName(text);       // e.g. 'NSTaggedPointerString'
```

Signature types are `id`, `class`, `sel`, `pointer`, `string` (a C string, not an NSString), `int`, `uint`, `long`, `ulong`, `float`, `double`, `bool`, and `void`. `long`/`ulong` use `bigint`. `ObjC.msgSend` still accepts untyped, no-argument memory selectors (`alloc`, `init…`, `retain`, `release`, `description`); every call with arguments uses `ObjC.send` so the ABI is explicit. Registered handlers from `ObjC.registerHandler` take precedence over the live runtime.

### Native Apple backend

`src/native/gea_ffi_apple.mm` exports typed wrappers for the same runtime: `gea_ffi_apple_get_class`, `gea_ffi_apple_get_selector`, `gea_ffi_apple_class_exists`, `gea_ffi_apple_create_nsstring`, `gea_ffi_apple_nsstring_to_utf8`, `gea_ffi_apple_release`, and `gea_ffi_apple_msg_send_{id0,id_id,id_int,id_uint,id_double,id_str,int0,uint0,long0,ulong0,double0,str0,void0}`.

`npm run test:apple-native` compiles that file with ARC and runs `fixtures/apple/apple_test.mm` against Foundation. It checks `NSString`, `NSProcessInfo`, UTF-8 round-trips, nil messaging, and release.

### Native JNI backend

`src/native/gea_ffi_android.cpp` exports a generic JNI bridge for native embedders: `gea_ffi_android_attach`/`env`, `find_class`, `get_static_method`/`get_method`/`get_constructor`, `new_global_ref`/`delete_ref`, `new_string`/`string_to_utf8`, `new_byte_array`/`byte_array_length`/`byte_array_copy`, `call_static`/`call_instance`/`new_object`, `exception_check`, and `last_error`.

Arguments and returns use `GeaJniValue`, a tagged union covering `void`, `boolean`, `byte`, `char`, `short`, `int`, `long`, `float`, `double`, object references, and strings. Strings cross the boundary as standard UTF-8: the bridge converts to and from UTF-16 internally because JNI's `NewStringUTF`/`GetStringUTFChars` use Modified UTF-8, which encodes non-BMP characters as surrogate pairs.

```cpp
GeaJniValue args[2] = {};
args[0].kind = GEA_JNI_INT; args[0].as.i = 19;
args[1].kind = GEA_JNI_INT; args[1].as.i = 23;

GeaJniValue result = {};
result.kind = GEA_JNI_INT;
void* clazz = gea_ffi_android_find_class("GeaJniTest");
void* add = gea_ffi_android_get_static_method(clazz, "add", "(II)I");
gea_ffi_android_call_static(clazz, add, args, 2, &result); // result.as.i == 42
gea_ffi_android_delete_ref(clazz);
```

`npm run test:jni-native` compiles the bridge with `GEA_ENABLE_JNI`, starts a real JVM through `JNI_CreateJavaVM`, and runs `fixtures/android/jni_host_test.cpp`. It covers static and instance calls, constructors, `int`/`long`/`double`/`bool`, UTF-8 strings with an emoji, byte arrays, missing classes and methods, and a Java exception followed by a successful call.

`npm run test:android-native` cross-compiles `gea_ffi_core`, `gea_ffi_embedded`, and `gea_ffi_android` with the NDK for `arm64-v8a`, `armeabi-v7a`, and `x86_64`, then checks the exported symbols.

### Native embedded registry

`include/gea/ffi/gea_ffi_registry.h` implements an allocation-free symbol table for AOT and microcontroller targets. It has no heap use and no STL dependency: entries live in a fixed array of `GEA_FFI_REGISTRY_CAPACITY` (128 by default) `{ const char*, void* }` pairs. Names are stored by pointer, so register string literals or static storage. The table is not thread-safe; fill it during startup.

```cpp
static int gpio_write(int pin, int value);
GEA_FFI_REGISTER_FUNCTION("gpio_write", (void*)&gpio_write);

void* fn = gea_ffi_embedded_lookup("gpio_write");
bool present = gea_ffi_embedded_has("gpio_write");
uint32_t count = gea_ffi_embedded_count();
```

The C ABI is `gea_ffi_embedded_register`/`lookup`/`has`/`unregister`/`count`/`capacity`/`clear`. Re-registering a name replaces it in place. Registration returns `false` for null input or a full table.

`npm run test:embedded-native` builds `fixtures/embedded/registry_test.cpp` on the host and checks auto-registration, replacement, unregistration, capacity overflow, and the C ABI. When `arm-none-eabi-g++` is available it also cross-compiles `gea_ffi_embedded.cpp` and a consumer for Cortex-M33 (RP2350) and Cortex-M0+ (RP2040). When `riscv64-unknown-elf-gcc` is available it compiles the same registry for `rv32imc` (ESP32-C3/C6 class). Both use `-ffreestanding -fno-exceptions -fno-rtti -fno-threadsafe-statics` and check the exported symbols. The `dlopen` loader is excluded from the bare-metal checks because it needs a C library; the RP2350/ESP32 firmware SDKs provide one.

### Native D-Bus backend

`src/native/gea_ffi_dbus.cpp` is a generic libdbus client for Linux and Sailfish OS. It supports the scalar types used by MCE, NGFD, UPower, BlueZ, NetworkManager, and desktop portals: strings, object paths, booleans, `int32`/`uint32`, `int64`/`uint64`, and doubles. Arrays, dictionaries, structs, and nested containers are rejected with an error rather than guessed at. A variant carrying one supported scalar is unwrapped, so `org.freedesktop.DBus.Properties.Get` works.

```cpp
void* bus = nullptr;
gea_ffi_dbus_connect(0, &bus); // 0 = session, 1 = system

GeaDbusValue arg = {};
arg.kind = GEA_DBUS_STRING;
arg.as.str = "org.freedesktop.DBus";

GeaDbusValue reply[4] = {};
int32_t count = 0;
gea_ffi_dbus_call(bus, "org.freedesktop.DBus", "/org/freedesktop/DBus",
                  "org.freedesktop.DBus", "GetNameOwner",
                  &arg, 1, reply, 4, &count);

gea_ffi_dbus_free((void*)reply[0].as.str);
gea_ffi_dbus_disconnect(bus);
```

`npm run test:dbus-native` compiles the bridge against `pkg-config dbus-1` and runs `fixtures/linux/dbus_test.cpp` inside `dbus-run-session`. It checks booleans, strings, uint32 results, the explicit-timeout entry point, missing methods, unknown services, and recovery after an error. Verified in a `node:22-bookworm` container with `libdbus-1-dev` and `dbus`.

Properties are read and written through `org.freedesktop.DBus.Properties` when the native bridge is built. Signals use an explicit polling API: `DBus.addMatch(rule)`, then `DBus.nextSignal(bus, timeoutMs)` from an app timer or worker; each call returns `{ interfaceName, member, path, args }` or `null` on timeout. The older `onSignal` listener table remains a simulation. On Sailfish OS this is the native path for MCE, NGFD, and DConf D-Bus services. It has not been run against those services or on a Sailfish device.

The TypeScript `DBus` module uses the same bridge when it is built as a host shared library:

```bash
npm run build:dbus-host
GEA_FFI_DBUS_LIBRARY=$PWD/build/dbus-native/libgea_ffi_dbus.so node your-app.mjs
```

`DBus.nativeAvailable` reports whether the bridge loaded. Calls go through `DBus.getProxy(...).callMethod(...)`; `DBus.close()` disconnects. Integer arguments default to `int32` when they fit, `uint32` above `INT32_MAX`, and `double` for fractions. Use `DBus.uint32(n)`, `DBus.int32(n)`, `DBus.int64(n)`, `DBus.uint64(n)`, `DBus.double(n)`, or `DBus.objectPath(s)` when the D-Bus signature needs an exact type. `DBus.registerMethodHandler` still takes precedence for tests.

`npm run test:dbus-ts-native` builds the host library and runs `test/dbus-native.test.mjs` under `dbus-run-session`. It starts a small libdbus service, then checks `NameHasOwner`, `GetNameOwner`, `GetId`, `GetConnectionUnixProcessID`, an error followed by recovery, handler precedence, `getProperty` through `org.freedesktop.DBus.Properties.Get` (string and uint32 variants), `setProperty` through `Properties.Set`, and a signal emitted by the service and received through `addMatch`/`nextSignal`.

### Native generic calls (libffi)

`src/native/gea_ffi_call.cpp` adds a typed call engine for native embedders. When the build finds libffi, `gea_ffi_call` maps a `GeaCallValue` array to `ffi_type`s and performs a default-ABI call through any function pointer:

```cpp
GeaCallValue arg = {};
arg.kind = GEA_CALL_STRING;
arg.as.str = "geastack";

GeaCallValue result = {};
result.kind = GEA_CALL_UINT64;
gea_ffi_call(gea_ffi_dlsym(libc, "strlen"), &arg, 1, &result); // result.as.u64 == 8
```

Supported kinds are `void`, `bool`, `int8`/`uint8`, `int16`/`uint16`, `int32`/`uint32`, `int64`/`uint64`, `float`, `double`, `pointer`, and `string`. Structs by value and variadic calls are rejected or unsupported. Builds without libffi still link: `gea_ffi_call_available()` returns `false` and calls fail with an error.

`npm run test:ffi-native` compiles with `pkg-config libffi` and runs `fixtures/call/ffi_call_test.cpp`. It performs generic calls to `getpid`, `strlen`, `strcmp`, `abs`, `toupper`, `malloc`/`free`, `gettimeofday`, and `pow`, then checks the null-function error. Verified on Linux x64 with libffi 3.4.

### C++ loader

`src/native/gea_ffi_core.cpp` exports:

- `gea_ffi_dlopen`, `gea_ffi_dlsym`, `gea_ffi_dlclose`
- `gea_ffi_alloc`, `gea_ffi_free`
- `gea_ffi_last_error`

On Linux and macOS this uses `dlopen`/`dlsym`. On Windows it uses `LoadLibraryW`/`GetProcAddress`. It records an error code when open or symbol lookup fails. It does not marshal arbitrary signatures; the caller casts the symbol pointer.

`fixtures/loader/loader_test.cpp` exercises that API. It opens `libc.so.6` on Linux or `libSystem.B.dylib` on macOS, calls `getpid`, `gettimeofday`, `malloc`, and `free`, checks a missing library and a missing symbol, and checks `gea_ffi_alloc`/`gea_ffi_free`.

## Known limitations

- Host calls are verified on Windows x64, Linux x64, and macOS arm64. The Windows demo also passes under Wine 7.7; Wine is a smoke test, not a native Windows run. iOS runs on the simulator and cross-compiles for device, but has not been executed on a physical device. Android is host-JVM-tested and cross-compiled for three ABIs but has not been executed on a device. The embedded registry is host-tested and cross-compiled for Cortex-M33/M0+ and RISC-V rv32imc, but not executed on hardware. Sailfish OS, physical ESP32 boards, and the browser have not been executed.
- The C++ loader resolves symbols. With libffi it performs generic typed calls through `gea_ffi_call`; without libffi the caller casts the symbol pointer. Struct-by-value and variadic calls are unsupported. Generic calls on Node go through `koffi`; native Apple and JNI calls go through their typed wrappers.
- `Memory` is a simulated heap. Passing one of its pointers into a native function throws.
- The live Objective-C runtime is available in the Node host on macOS only. The TypeScript `ObjC` module falls back to simulation elsewhere; iOS apps use `gea_ffi_apple_*` from C++/Objective-C.
- The JNI bridge is native C++. The TypeScript `JNI` module remains an in-process simulation; it does not call a JVM from Node.
- `ObjC.createBlock` returns a simulated block handle. Creating a real Objective-C block from JavaScript is not implemented.
- Linux `Sysfs` and `POSIX.ioctl` call libc on Linux (and macOS). The native libdbus bridge is real and host-tested, and the TypeScript `DBus` module uses it when the host library is built; D-Bus properties are read and written through `Properties.Get`/`Set`, and signals use the polling `addMatch`/`nextSignal` API. The `onSignal` listener table remains simulated. `WinRegistry` reads and writes the real registry on Windows when `{ backend: 'native' }` is used. `COM.initialize`, `COM.createGuid`, `COM.createInstance`, `AddRef`, `Release`, `QueryInterface`, and `callVTable` have native ole32 paths; the named-method COM dispatcher, the Sailfish D-Bus service wrappers, and the embedded JavaScript `NativeRegistry` remain in-process simulations. The native JNI and embedded C++ registries are separate real implementations.
- Codegen bridges are compile-verified for C, macOS/iOS Objective-C++, Android JNI, Linux, Sailfish, and Windows (MinGW). The generated function bodies are scaffolds that return placeholders; they are not automatically wired to an SDK call.
- `apps/sailfishos-ffi` is a GeaStack JSX/CSS app for the `sailfishos` target. It calls `libc.so.6` and generates the Sailjail desktop section. MCE, NGFD, and DConf are not used there.
- Examples under `examples/` and `apps/macos-battery-app/` are sketches. They are not the verified path.

## Platform support

Status comes from commands run in this workspace on 21 October 2026. "Not run" means this workspace did not build or execute that target.

| Target | Compile | Automated test | Runtime |
| --- | --- | --- | --- |
| Windows x64 Node host | `koffi` prebuild | `npm test`: pass; Linux and macOS cases skipped. `npm run test:windows-wine`: 26/26 under Wine 7.7 | `kernel32` process id, `FILETIME`/`SYSTEMTIME`, `HeapAlloc`/`HeapFree`, `user32` `GetSystemMetrics`, `ucrtbase` `strlen`/`atoi`, `advapi32` registry read/write/delete, `ole32` init/GUID. Native Windows demo pending |
| Linux x64 Node host | `koffi` prebuild | `node:22-bookworm` container: 63 tests, 50 pass, 13 skipped; `npm run test:loader`: `loader_test ok`; `npm run test:dbus-native`: `dbus_test ok` | `libc` `getpid`, `strlen`, `gettimeofday`, `malloc`/`free`; `libm` `cos(0) === 1`, `pow(2, 8) === 256`; real `/proc` reads, temp-file write/read, ioctl errno (`ENOTTY`); libdbus session calls; missing library and symbol |
| macOS arm64 Node host | `koffi` prebuild | `npm test`: 63 tests, 51 pass, 12 skipped | `libSystem` `getpid`, `strlen`, `gettimeofday`, `malloc`/`free`, `cos`, `pow`; live `objc_msgSend` against `NSString`, `NSProcessInfo`, `NSNumber`; missing library and symbol |
| Linux x64 C++ static library | CMake built `gea_ffi` with libffi; `g++ -std=c++17` built `gea_ffi_core`, `gea_ffi_embedded`, `gea_ffi_linux`, `gea_ffi_sailfishos` | `npm run test:loader`: `loader_test ok`; `npm run test:ffi-native`: `ffi_call_test ok` | `dlopen`/`dlsym` of libc, generic typed calls (`getpid`, `strlen`, `strcmp`, `abs`, `toupper`, `malloc`/`free`, `gettimeofday`, `pow`), struct via `gettimeofday`, non-zero `gea_ffi_last_error` |
| macOS arm64 C++ static library | CMake built `gea_ffi` with ARC; `clang++` built the Apple test | `npm run test:loader`: `loader_test ok`; `npm run test:apple-native`: `apple_test ok` | `dlopen`/`dlsym` of libSystem, `gettimeofday`, live Objective-C messages, nil messaging |
| iOS simulator | `npm run test:ios` built `iphonesimulator-arm64`, `iphonesimulator-x86_64`, and `iphoneos-arm64` archives plus a header consumer | `npm run test:ios-sim`: `ios_sim_test ok` on an iPhone simulator | Live Objective-C and `dlopen` on the simulator; not run on a physical device |
| iOS device | `npm run test:ios` built the arm64 archive | Compile/link only | Not run. Requires a signed app |
| Windows x64 C++ static library | `npm run test:windows-native` cross-compiled `gea_ffi_core`, `gea_ffi_embedded`, `gea_ffi_windows`, and `gea_ffi_call` with MinGW-w64 in a Linux container | Symbol checks on `libgea_ffi_windows.a`; MSVC not run | `LoadLibraryW`/`GetProcAddress` and the UTF-16 registry helpers compile; runtime pending the Windows demo |
| Android | `npm run test:android-native` built `arm64-v8a`, `armeabi-v7a`, and `x86_64` archives with NDK 28.2 | `npm run test:jni-native`: `jni_test ok` on a host JVM | Real JNI: static/instance calls, constructor, `int`/`long`/`double`/`bool`, UTF-8 strings with emoji, byte arrays, exceptions. Not run on a device |
| Sailfish OS | The Sailfish XDG helpers and the libdbus bridge compile on Linux; no Sailfish SDK or device build | `dbus_test ok` on Linux; JS tests use an in-process D-Bus table | Not run on a device or against MCE/NGFD/DConf |
| RP2350 / RP2040 | `npm run test:embedded-native` cross-compiled the registry for Cortex-M33 and Cortex-M0+ with `arm-none-eabi-g++` | `embedded_test ok` on the host; symbol checks on both ARM archives | Not run on hardware |
| ESP32-C3/C6 | `npm run test:embedded-native` compiled the registry for `rv32imc` with `riscv64-unknown-elf-gcc` in a Linux container | Symbol checks on the RISC-V archive | Not run on hardware. Classic Xtensa ESP32 is not compiled |
| ESP32 (Xtensa) | Not run; no Xtensa toolchain in this workspace | JavaScript `NativeRegistry` tests only | Not run on hardware |
| Web | No host backend | None | None |

## Tests and CI

```bash
npm test                 # build, unit tests, mock tests, and host FFI for this OS
npm run test:mock        # no shared library
npm run test:native      # host FFI only
npm run test:loader      # compile the C++ loader and run it
npm run test:ffi-native  # Linux: libffi generic calls (skips without libffi)
npm run test:windows-native # MinGW-w64 cross-compile of the Windows native library
npm run test:windows-wine   # Windows demo under Wine (skips without Wine)
npm run test:apple-native # macOS: native Objective-C backend
npm run test:ios         # macOS + Xcode: iOS static library cross-compile
npm run test:ios-sim     # macOS + Xcode: run the native test on an iPhone simulator
npm run test:jni-native  # host JDK: real JVM through the JNI bridge
npm run test:android-native # NDK: Android static library cross-compile
npm run test:embedded-native # host registry + Cortex-M cross-compile
npm run test:dbus-native  # Linux: libdbus session-bus test (skips without libdbus)
npm run test:dbus-ts-native # Linux: build the host libdbus bridge and test the TS DBus API
npm run test:codegen-native # compile generated C, Apple, JNI, Linux, Sailfish, Windows bridges
```

`.github/workflows/ci.yml` runs `npm test` and `npm run test:loader` on `ubuntu-latest`, `windows-latest`, and `macos-latest`, plus `test:apple-native`, `test:ios`, and `test:ios-sim` on macOS, `test:ffi-native` and `test:windows-native` on Linux, `test:jni-native` on Linux and macOS with a Temurin JDK, `test:android-native` on Linux, `test:embedded-native` on Linux and macOS (Cortex-M and RISC-V cross-compiles are skipped when those toolchains are absent), `test:dbus-native` and `test:dbus-ts-native` on Linux after installing `libdbus-1-dev` and `dbus`, and `test:codegen-native` on Linux and macOS (MinGW on Linux compiles the Windows bridge). That workflow has not been executed from this workspace.

## Package metadata

- Name: `@geastack/ffi`
- Version: `0.1.0` in `package.json` and `gea-plugin.json`
- Repository: https://github.com/mehmetfiskindal/geastack-ffi
- License: Apache-2.0

`npm pack --dry-run` publishes 78 files: `dist/` JavaScript and declarations, `include/gea/ffi/*.h`, `src/native/` sources and `CMakeLists.txt`, `gea-plugin.json`, `README.md`, `LICENSE`, and `package.json`. Tests, fixtures, and the macOS sample app are not in the tarball. `koffi` is an npm dependency, not vendored.

## License

Apache-2.0
