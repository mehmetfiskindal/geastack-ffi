# Windows FFI demo

Runs real Win32 and COM calls through `@geastack/ffi` on a Windows x64 machine.

## Run

From the repository root on Windows (Node.js 20.19 or newer):

```bat
cd demos\windows-ffi
run.cmd
```

Or with PowerShell:

```powershell
cd demos\windows-ffi
.\run.ps1
```

Manual form:

```bat
npm install
npm run build
node demos\windows-ffi\demo.mjs
```

## What it proves

| Call | Library | Kind |
| --- | --- | --- |
| `GetCurrentProcessId` | `kernel32.dll` | real |
| `GetSystemTimeAsFileTime` + `FileTimeToSystemTime` | `kernel32.dll` | real, struct in/out |
| `GetTickCount64` | `kernel32.dll` | real, `uint64`/`bigint` |
| `GetSystemMetrics(SM_CMONITORS)` | `user32.dll` | real |
| `IsProcessorFeaturePresent` | `kernel32.dll` | real |
| `GetACP` | `kernel32.dll` | real |
| `GetFileAttributesW` | `kernel32.dll` | real, UTF-16 string |
| `GetProcessHeap` / `HeapAlloc` / `HeapFree` | `kernel32.dll` | real, native heap |
| `strlen` / `atoi` | `ucrtbase.dll` | real |
| `COM.initialize` / `COM.createGuid` / `COM.uninitialize` | `ole32.dll` | real COM init and GUID |
| `COM.createInstance` + `AddRef`/`Release`/`QueryInterface` on `ShellLink` | `ole32.dll` | real COM vtable calls |
| `IShellLinkW.SetPath` / `SetArguments` / `GetShowCmd` / `GetPath` / `GetArguments` | `ole32.dll` | named COM method dispatch through `COM.defineInterface`, including out-parameters |
| `RegGetValueW("SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion", "ProductName")` | `advapi32.dll` | real registry read |
| `RegSetValueExW` / `RegGetValueW` / `RegDeleteTreeW` on a temporary HKCU key | `advapi32.dll` | real registry write, read-back, and cleanup |

`CoCreateGuid` writes into a 16-byte `GUID` struct defined with `defineStruct`, so the demo also checks the Windows x64 struct ABI.

## Expected output

```text
@geastack/ffi Windows demo on Node v22.x.x

[ok]   kernel32!GetCurrentProcessId: 12345 (expected 12345)
[ok]   ucrtbase!strlen("geastack"): 8n (expected 8n)
...
[ok]   ole32!CoCreateGuid: 0
[ok]   CoCreateGuid is non-zero: 3f2a...

33/33 checks passed
windows_demo ok
```

If a check fails, the process exits with code 1 and prints the failed check names. The registry round-trip creates and deletes `HKCU\\Software\\GeaStackFfiDemo-<pid>`; it does not touch existing values.

## Notes

- The demo needs the repository's `dist/` build; `run.cmd` and `run.ps1` build it if missing.
- `npm run test:windows-wine` runs the same demo under Wine (33/33). Wine is a smoke test, not a native Windows run.
- It uses the native `koffi` backend. It does not fall back to mocks.
- `WinRegistry` and the COM object dispatcher are not exercised here; those TypeScript helpers remain simulations. The COM calls above are raw `ole32` exports.
