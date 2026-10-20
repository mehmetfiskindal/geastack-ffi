// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { Library, defineStruct } from '../../dist/index.js';

const FileTime = defineStruct('FILETIME', {
  dwLowDateTime: 'uint32',
  dwHighDateTime: 'uint32',
});

const SystemTime = defineStruct('SYSTEMTIME', {
  wYear: 'uint16',
  wMonth: 'uint16',
  wDayOfWeek: 'uint16',
  wDay: 'uint16',
  wHour: 'uint16',
  wMinute: 'uint16',
  wSecond: 'uint16',
  wMilliseconds: 'uint16',
});

const Timeval = defineStruct('timeval', {
  tv_sec: 'int64',
  tv_usec: 'int64',
});

test('windows host calls kernel32 and ucrtbase', { skip: process.platform !== 'win32' }, () => {
  assert.equal(FileTime.size, 8);
  assert.equal(FileTime.fields.dwLowDateTime.offset, 0);
  assert.equal(FileTime.fields.dwHighDateTime.offset, 4);
  assert.equal(SystemTime.size, 16);
  assert.equal(SystemTime.fields.wYear.offset, 0);
  assert.equal(SystemTime.fields.wMilliseconds.offset, 14);

  const kernel32 = Library.open('kernel32', {
    pid: { symbol: 'GetCurrentProcessId', args: [], returns: 'uint32' },
    GetSystemTimeAsFileTime: { args: [FileTime], returns: 'void' },
    FileTimeToSystemTime: { args: [FileTime, SystemTime], returns: 'int32' },
    GetProcessHeap: { args: [], returns: 'pointer' },
    HeapAlloc: { args: ['pointer', 'uint32', 'uint64'], returns: 'pointer' },
    HeapFree: { args: ['pointer', 'uint32', 'pointer'], returns: 'int32' },
  }, { backend: 'native' });

  assert.equal(kernel32.symbols.pid(), process.pid);
  const symbol = kernel32.getSymbolAddress('GetCurrentProcessId');
  assert.equal(symbol.isNull(), false);
  assert.notEqual(symbol.address, 0x30000000n);

  const fileTime = FileTime.alloc();
  kernel32.symbols.GetSystemTimeAsFileTime(fileTime);
  assert.notEqual(fileTime.get('dwLowDateTime') + fileTime.get('dwHighDateTime'), 0);

  const systemTime = SystemTime.alloc();
  const converted = kernel32.symbols.FileTimeToSystemTime(fileTime, systemTime);
  assert.notEqual(converted, 0);
  assert.equal(systemTime.get('wYear'), new Date().getUTCFullYear());
  assert.ok(systemTime.get('wMonth') >= 1 && systemTime.get('wMonth') <= 12);

  const heap = kernel32.symbols.GetProcessHeap();
  assert.equal(heap.isNull(), false);
  const block = kernel32.symbols.HeapAlloc(heap, 0x00000008, 64n);
  assert.equal(block.isNull(), false);
  assert.equal(kernel32.symbols.HeapFree(heap, 0, block), 1);

  fileTime.free();
  systemTime.free();
  kernel32.close();
  assert.throws(() => kernel32.symbols.pid(), /is closed/);
  assert.throws(() => kernel32.getSymbolAddress('GetCurrentProcessId'), /is closed/);

  const crt = Library.open('ucrtbase.dll', {
    strlen: { args: ['string'], returns: 'uint64' },
  }, { backend: 'native' });
  assert.equal(crt.symbols.strlen('geastack'), 8n);
  crt.close();

  assert.throws(() => Library.open('C:\\no\\such\\gea_ffi_missing.dll', {
    missing: { args: [], returns: 'void' },
  }, { backend: 'native' }), /Failed to load shared library/);

  assert.throws(() => Library.open('kernel32.dll', {
    ThisSymbolDoesNotExist: { args: [], returns: 'void' },
  }, { backend: 'native' }), /was not found/);
});

test('linux host calls libc', { skip: process.platform !== 'linux' }, () => {
  assert.equal(Timeval.size, 16);
  assert.equal(Timeval.fields.tv_sec.offset, 0);
  assert.equal(Timeval.fields.tv_usec.offset, 8);

  const libc = Library.open('libc.so.6', {
    getpid: { args: [], returns: 'int32' },
    strlen: { args: ['string'], returns: 'uint64' },
    gettimeofday: { args: [Timeval, 'pointer'], returns: 'int32' },
    malloc: { args: ['uint64'], returns: 'pointer' },
    free: { args: ['pointer'], returns: 'void' },
  }, { backend: 'native' });

  assert.equal(libc.symbols.getpid(), process.pid);
  assert.equal(libc.symbols.strlen('geastack'), 8n);
  const symbol = libc.getSymbolAddress('strlen');
  assert.equal(symbol.isNull(), false);
  assert.notEqual(symbol.address, 0x30000000n);

  const now = Timeval.alloc();
  assert.equal(libc.symbols.gettimeofday(now, null), 0);
  const seconds = now.get('tv_sec');
  assert.equal(typeof seconds, 'bigint');
  assert.ok(seconds > 1700000000n);
  assert.ok(now.get('tv_usec') >= 0n);

  const block = libc.symbols.malloc(64n);
  assert.equal(block.isNull(), false);
  libc.symbols.free(block);

  now.free();
  libc.close();
  assert.throws(() => libc.symbols.getpid(), /is closed/);

  const libm = Library.open('libm.so.6', {
    cos: { args: ['double'], returns: 'double' },
    pow: { args: ['double', 'double'], returns: 'double' },
  }, { backend: 'native' });
  assert.equal(libm.symbols.cos(0), 1);
  assert.equal(libm.symbols.pow(2, 8), 256);
  libm.close();

  assert.throws(() => Library.open('libgea_ffi_missing.so', {
    missing: { args: [], returns: 'void' },
  }, { backend: 'native' }), /Failed to load shared library/);

  assert.throws(() => Library.open('libc.so.6', {
    this_symbol_does_not_exist: { args: [], returns: 'void' },
  }, { backend: 'native' }), /was not found/);
});
