# @geastack/ffi

Call C shared libraries from Node, and build the small C++ loader used by GeaStack native targets.

Version 0.1.0. The Node host loader is verified on Windows x64 and Linux x64. The Objective-C, JNI, COM, D-Bus, Sailfish, and microcontroller JavaScript APIs in this package are in-process simulations. They are not device backends.

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

### Memory

`Memory.alloc`, `Memory.free`, `read`/`write` primitives, and C-string helpers address a simulated heap inside the process. They are for staging and for tests. They do not call `malloc` or `HeapAlloc`.

To allocate and release native memory, bind the platform functions and call them, as the `malloc`/`free` and `HeapAlloc`/`HeapFree` examples do.

### registerMockFunction(library, symbol, fn)

Registers an in-process replacement. Mock tests live in `test/mock/` and do not load a shared library. Host tests live in `test/native/` and pass `{ backend: 'native' }`.

### C++ loader

`src/native/gea_ffi_core.cpp` exports:

- `gea_ffi_dlopen`, `gea_ffi_dlsym`, `gea_ffi_dlclose`
- `gea_ffi_alloc`, `gea_ffi_free`
- `gea_ffi_last_error`

On Linux this uses `dlopen`/`dlsym`. On Windows it uses `LoadLibraryW`/`GetProcAddress`. It records an error code when open or symbol lookup fails. It does not marshal arbitrary signatures; the caller casts the symbol pointer.

`fixtures/loader/loader_test.cpp` exercises that API. On Linux it opens `libc.so.6`, calls `getpid`, `gettimeofday`, `malloc`, and `free`, checks a missing library and a missing symbol, and checks `gea_ffi_alloc`/`gea_ffi_free`.

## Known limitations

- Host calls are verified on Windows x64 and Linux x64 only. macOS, iOS, Android, Sailfish OS, ESP32, RP2350, and the browser have not been executed.
- The C++ loader can resolve a symbol. It cannot take a TypeScript function descriptor and perform a generic call. Generic calls on Node go through `koffi`.
- `Memory` is a simulated heap. Passing one of its pointers into a native function throws.
- JavaScript modules under `apple`, `android`, `windows` (registry and COM), `linux` (sysfs, ioctl, D-Bus), `sailfishos`, and `embedded` keep their state in process memory. Their tests register handlers or fixtures. They do not talk to IOKit, a JVM, a D-Bus daemon, or a microcontroller.
- Codegen emits source text. That output was not compiled in this verification, except for the hand-written files in `src/native/` that the Linux loader test compiles.
- Examples under `examples/` and `apps/macos-battery-app/` are sketches. They are not the verified path.

## Platform support

Status comes from commands run in this workspace on 20 October 2026. "Not run" means this workspace did not build or execute that target.

| Target | Compile | Automated test | Runtime |
| --- | --- | --- | --- |
| Windows x64 Node host | `koffi` prebuild | `npm test`: pass (40 pass, Linux case skipped) | `kernel32` process id, `FILETIME`/`SYSTEMTIME`, `HeapAlloc`/`HeapFree`, `ucrtbase` `strlen`, missing library, missing symbol, `close()` |
| Linux x64 Node host | `koffi` prebuild | Kali: 40 pass, Windows case skipped | `libc` `getpid`, `strlen`, `gettimeofday`, `malloc`/`free`; `libm` `cos(0) === 1`, `pow(2, 8) === 256`; missing library and symbol |
| Linux x64 C++ static library | `g++ -std=c++17` built `gea_ffi_core`, `gea_ffi_embedded`, `gea_ffi_linux`, `gea_ffi_sailfishos` | `npm run test:loader` printed `loader_test ok` | `dlopen`/`dlsym` of libc, struct via `gettimeofday`, `malloc`/`free`, loader `alloc`/`free`, non-zero `gea_ffi_last_error` |
| Windows x64 C++ static library | Not run. No MSVC `cl` on `PATH` | Not run | Not run. `LoadLibraryW` is implemented and covered by CI when Visual Studio is present |
| macOS / iOS | Not run | ObjC tests call in-process handlers | No `objc_msgSend` |
| Android | Not run | JNI tests call in-process handlers | No JVM |
| Sailfish OS | The Sailfish C++ file compiled on Linux. It only builds XDG paths | JS tests use an in-process D-Bus table | Not run on a device |
| ESP32 / RP2350 | Embedded registry objects linked into the Linux static library. No MCU cross-compile | `NativeRegistry` tests use a JavaScript `Map` | Not run on hardware |
| Web | No host backend | None | None |

## Tests and CI

```bash
npm test            # build, unit tests, mock tests, and host FFI for this OS
npm run test:mock   # no shared library
npm run test:native # host FFI only
npm run test:loader # compile the C++ loader and run it
```

`.github/workflows/ci.yml` runs `npm test` and `npm run test:loader` on `ubuntu-latest` and `windows-latest`. That workflow has not been executed from this workspace.

## Package metadata

- Name: `@geastack/ffi`
- Version: `0.1.0` in `package.json` and `gea-plugin.json`
- Repository: https://github.com/mehmetfiskindal/geastack-ffi
- License: Apache-2.0

`npm pack --dry-run` publishes 62 files: `dist/` JavaScript and declarations, `include/gea/ffi/*.h`, `src/native/` sources and `CMakeLists.txt`, `gea-plugin.json`, `README.md`, `LICENSE`, and `package.json`. Tests, fixtures, and the macOS sample app are not in the tarball. `koffi` is an npm dependency, not vendored.

## License

Apache-2.0
