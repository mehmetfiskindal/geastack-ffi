// SPDX-License-Identifier: Apache-2.0
/**
 * Windows FFI demo.
 *
 * Run from the repository root after `npm install && npm run build`:
 *   node demos/windows-ffi/demo.mjs
 * or double-click `run.cmd` / run `run.ps1`.
 *
 * Every symbol below is loaded from a real Windows DLL. The only simulated
 * surface is the WinRegistry helper, which is not used here.
 */
import { Library, defineStruct, WinRegistry, HKEY } from '../../dist/index.js';

if (process.platform !== 'win32') {
  console.error('This demo must run on Windows (process.platform === "win32").');
  process.exit(2);
}

const results = [];

function check(name, actual, predicate, expected) {
  const ok = predicate(actual);
  results.push({ name, ok, actual, expected });
  console.log(`${ok ? '[ok]  ' : '[FAIL]'} ${name}: ${format(actual)}${expected ? ` (expected ${expected})` : ''}`);
  return ok;
}

function format(value) {
  if (typeof value === 'bigint') return `${value}n`;
  if (value && typeof value.toHex === 'function') return value.toHex();
  return String(value);
}

const FILETIME = defineStruct('FILETIME', {
  dwLowDateTime: 'uint32',
  dwHighDateTime: 'uint32',
});

const SYSTEMTIME = defineStruct('SYSTEMTIME', {
  wYear: 'uint16',
  wMonth: 'uint16',
  wDayOfWeek: 'uint16',
  wDay: 'uint16',
  wHour: 'uint16',
  wMinute: 'uint16',
  wSecond: 'uint16',
  wMilliseconds: 'uint16',
});

const GUID = defineStruct('GUID', {
  Data1: 'uint32',
  Data2: 'uint16',
  Data3: 'uint16',
  Data4_0: 'uint8',
  Data4_1: 'uint8',
  Data4_2: 'uint8',
  Data4_3: 'uint8',
  Data4_4: 'uint8',
  Data4_5: 'uint8',
  Data4_6: 'uint8',
  Data4_7: 'uint8',
});

const kernel32 = Library.open('kernel32', {
  GetCurrentProcessId: { args: [], returns: 'uint32' },
  GetSystemTimeAsFileTime: { args: [FILETIME], returns: 'void' },
  FileTimeToSystemTime: { args: [FILETIME, SYSTEMTIME], returns: 'int32' },
  GetTickCount64: { args: [], returns: 'uint64' },
  GetSystemMetrics: { args: ['int32'], returns: 'int32' },
  IsProcessorFeaturePresent: { args: ['uint32'], returns: 'int32' },
  GetACP: { args: [], returns: 'uint32' },
  GetFileAttributesW: { args: ['wstring'], returns: 'uint32' },
  GetProcessHeap: { args: [], returns: 'pointer' },
  HeapAlloc: { args: ['pointer', 'uint32', 'uint64'], returns: 'pointer' },
  HeapFree: { args: ['pointer', 'uint32', 'pointer'], returns: 'int32' },
}, { backend: 'native' });

const ucrtbase = Library.open('ucrtbase', {
  strlen: { args: ['string'], returns: 'uint64' },
  atoi: { args: ['string'], returns: 'int32' },
}, { backend: 'native' });

const ole32 = Library.open('ole32', {
  CoInitializeEx: { args: ['pointer', 'uint32'], returns: 'int32' },
  CoCreateGuid: { args: [GUID], returns: 'int32' },
  CoUninitialize: { args: [], returns: 'void' },
}, { backend: 'native' });

console.log(`@geastack/ffi Windows demo on Node ${process.version}`);
console.log('');

check('kernel32!GetCurrentProcessId', kernel32.symbols.GetCurrentProcessId(), (v) => v === process.pid, String(process.pid));
check('ucrtbase!strlen("geastack")', ucrtbase.symbols.strlen('geastack'), (v) => v === 8n, '8n');
check('ucrtbase!atoi("  42xyz")', ucrtbase.symbols.atoi('  42xyz'), (v) => v === 42, '42');
check('kernel32!GetACP', kernel32.symbols.GetACP(), (v) => v > 0);
check('kernel32!GetSystemMetrics(SM_CMONITORS)', kernel32.symbols.GetSystemMetrics(80), (v) => v >= 1);
check('kernel32!IsProcessorFeaturePresent(SSE3)', kernel32.symbols.IsProcessorFeaturePresent(13), (v) => v === 0 || v === 1);
check('kernel32!GetTickCount64', kernel32.symbols.GetTickCount64(), (v) => typeof v === 'bigint' && v > 0n);

const fileTime = FILETIME.alloc();
kernel32.symbols.GetSystemTimeAsFileTime(fileTime);
const systemTime = SYSTEMTIME.alloc();
const converted = kernel32.symbols.FileTimeToSystemTime(fileTime, systemTime);
check('kernel32!FileTimeToSystemTime', converted, (v) => v !== 0);
check(
  'SYSTEMTIME.wYear',
  systemTime.get('wYear'),
  (v) => v >= 2024 && v <= 2100,
  String(new Date().getUTCFullYear())
);
fileTime.free();
systemTime.free();

const systemRoot = process.env.SystemRoot || 'C:\\Windows';
const attributes = kernel32.symbols.GetFileAttributesW(systemRoot);
check(`kernel32!GetFileAttributesW("${systemRoot}")`, attributes, (v) => v !== 0xffffffff);

const heap = kernel32.symbols.GetProcessHeap();
const block = kernel32.symbols.HeapAlloc(heap, 0x00000008, 256n);
check('kernel32!HeapAlloc(256)', block, (v) => !v.isNull());
check('kernel32!HeapFree', kernel32.symbols.HeapFree(heap, 0, block), (v) => v === 1);

const hrInit = ole32.symbols.CoInitializeEx(null, 2 /* COINIT_APARTMENTTHREADED */);
check('ole32!CoInitializeEx', hrInit, (v) => v === 0 || v === 1 || v === -2147417850 /* RPC_E_CHANGED_MODE */);

const guid = GUID.alloc();
const hrGuid = ole32.symbols.CoCreateGuid(guid);
check('ole32!CoCreateGuid', hrGuid, (v) => v === 0);
const guidText = [
  guid.get('Data1').toString(16).padStart(8, '0'),
  guid.get('Data2').toString(16).padStart(4, '0'),
  guid.get('Data3').toString(16).padStart(4, '0'),
  [guid.get('Data4_0'), guid.get('Data4_1')].map((b) => b.toString(16).padStart(2, '0')).join(''),
  [guid.get('Data4_2'), guid.get('Data4_3'), guid.get('Data4_4'), guid.get('Data4_5'), guid.get('Data4_6'), guid.get('Data4_7')]
    .map((b) => b.toString(16).padStart(2, '0')).join(''),
].join('-');
check('CoCreateGuid is non-zero', guidText, (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) && !/^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(v));
guid.free();
if (hrInit === 0 || hrInit === 1) {
  ole32.symbols.CoUninitialize();
}

const productName = WinRegistry.readString(
  HKEY.HKEY_LOCAL_MACHINE,
  'SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion',
  'ProductName',
  { backend: 'native' }
);
check('advapi32!RegGetValueW ProductName', productName, (v) => typeof v === 'string' && v.length > 0, 'non-empty');

kernel32.close();
ucrtbase.close();
ole32.close();

const failed = results.filter((entry) => !entry.ok);
console.log('');
console.log(`${results.length - failed.length}/${results.length} checks passed`);
if (failed.length > 0) {
  console.error('Failed checks:', failed.map((entry) => entry.name).join(', '));
  process.exit(1);
}
console.log('windows_demo ok');
