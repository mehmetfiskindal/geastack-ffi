// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Win32,
  WinRegistry,
  COM,
  HRESULT,
  HKEY,
  Memory,
  defineStruct,
  registerMockFunction,
} from '../dist/index.js';

test('Win32 UTF-16LE wide string (LPCWSTR) allocation and reading with Unicode', () => {
  const original = 'Merhaba GeaStack! Windows Türkçe Karakter Testi 🚀';
  const ptr = Win32.toWideString(original);
  assert.equal(ptr.isNull(), false);

  const decoded = Win32.fromWideString(ptr);
  assert.equal(decoded, original);
  Memory.free(ptr);
});

test('Win32 HRESULT helpers and error checking', () => {
  assert.equal(Win32.SUCCEEDED(HRESULT.S_OK), true);
  assert.equal(Win32.SUCCEEDED(HRESULT.S_FALSE), true);
  assert.equal(Win32.FAILED(HRESULT.E_FAIL), true);
  assert.equal(Win32.FAILED(HRESULT.E_ACCESSDENIED), true);

  assert.doesNotThrow(() => Win32.checkHResult(HRESULT.S_OK));
  assert.throws(
    () => Win32.checkHResult(HRESULT.E_ACCESSDENIED, 'OpenProcess'),
    /OpenProcess failed with HRESULT 0x80070005/
  );
});

test('Win32 openSystemLibrary resolves .dll and calls Win32 APIs', () => {
  const SYSTEM_POWER_STATUS = defineStruct('SYSTEM_POWER_STATUS', {
    acLineStatus: 'uint8',
    batteryFlag: 'uint8',
    batteryLifePercent: 'uint8',
    systemStatusFlag: 'uint8',
    batteryLifeTime: 'uint32',
    batteryFullLifeTime: 'uint32',
  });

  registerMockFunction('kernel32.dll', 'GetSystemPowerStatus', (statusPtr) => {
    const inst = SYSTEM_POWER_STATUS.fromPointer(statusPtr);
    inst.set('acLineStatus', 1);
    inst.set('batteryLifePercent', 88);
    return true;
  });

  const kernel32 = Win32.openSystemLibrary('kernel32', {
    GetSystemPowerStatus: {
      args: ['pointer'],
      returns: 'bool',
      abi: 'stdcall',
    },
  });

  assert.equal(kernel32.path, 'kernel32.dll');
  const status = SYSTEM_POWER_STATUS.alloc();
  const ok = kernel32.symbols.GetSystemPowerStatus(status.pointer);
  assert.equal(ok, true);
  assert.equal(status.get('acLineStatus'), 1);
  assert.equal(status.get('batteryLifePercent'), 88);

  status.free();
  kernel32.close();
});

test('WinRegistry reads and writes string and DWORD values', () => {
  WinRegistry.writeString(
    HKEY.HKEY_LOCAL_MACHINE,
    'SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion',
    'ProductName',
    'Windows 11 Pro'
  );
  WinRegistry.writeDword(
    HKEY.HKEY_LOCAL_MACHINE,
    'SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion',
    'CurrentMajorVersionNumber',
    10
  );

  const productName = WinRegistry.readString(
    HKEY.HKEY_LOCAL_MACHINE,
    'SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion',
    'ProductName'
  );
  const listed = WinRegistry.listValues(
    HKEY.HKEY_LOCAL_MACHINE,
    'SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion',
    { backend: 'store' }
  );
  assert.equal(listed.some((value) => value.name === 'ProductName' && value.type === 1), true);
  assert.equal(listed.some((value) => value.name === 'CurrentMajorVersionNumber' && value.type === 4), true);

  const majorVer = WinRegistry.readDword(
    HKEY.HKEY_LOCAL_MACHINE,
    'SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion',
    'CurrentMajorVersionNumber'
  );

  assert.equal(productName, 'Windows 11 Pro');
  assert.equal(majorVer, 10);
});

test('COM GUID parsing, CoCreateInstance, and method dispatch', () => {
  const hr = COM.initialize('MTA');
  assert.equal(hr, HRESULT.S_OK);
  assert.equal(COM.isInitialized(), true);

  const clsid = '{DC12A687-737F-11CF-884D-00AA004B2E24}';
  const iid = '{DC12A681-737F-11CF-884D-00AA004B2E24}';

  const parsed = COM.parseGuid(clsid);
  assert.equal(parsed.canonical, 'DC12A687-737F-11CF-884D-00AA004B2E24');
  assert.equal(parsed.data1, 0xdc12a687);

  COM.registerHandler(`${parsed.canonical}::ConnectServer`, (_target, namespacePath) => {
    return `Connected:${namespacePath}`;
  });

  const locator = COM.createInstance(clsid, iid);
  const conn = locator.call('ConnectServer', 'ROOT\\CIMV2');
  assert.equal(conn, 'Connected:ROOT\\CIMV2');

  assert.equal(locator.addRef(), 2);
  assert.equal(locator.release(), 1);
  assert.equal(locator.release(), 0);

  assert.throws(() => locator.call('ConnectServer', 'ROOT\\CIMV2'), /released or NULL/);
  COM.uninitialize();
});

test('WinRegistry native backend is gated to Windows', { skip: process.platform === 'win32' }, () => {
  const value = WinRegistry.readString(
    HKEY.HKEY_LOCAL_MACHINE,
    'SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion',
    'ProductName',
    { backend: 'native' }
  );
  assert.equal(value, null);
});

test('Win32 last error round-trips', () => {
  Win32.setLastError(1234);
  assert.equal(Win32.getLastError(), 1234);
  Win32.setLastError(0);
});

test('WinRegistry native delete is gated to Windows', { skip: process.platform === 'win32' }, () => {
  assert.equal(
    WinRegistry.deleteKey(HKEY.HKEY_CURRENT_USER, 'Software\\GeaStackFfiNoSuchKey', { backend: 'native' }),
    false
  );
});

test('COM.createGuid returns a canonical GUID', () => {
  const guid = COM.createGuid();
  assert.match(guid, /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/);
});

test('COM native mode is gated to Windows', { skip: process.platform === 'win32' }, () => {
  assert.throws(() => COM.initialize('MTA', { backend: 'native' }), /ole32 is not available/);
});

test('COMObject.callVTable is native-only', () => {
  const object = COM.createInstance(
    '{00021401-0000-0000-C000-000000000046}',
    '{000214F9-0000-0000-C000-000000000046}'
  );
  assert.throws(() => object.callVTable(3, 'hresult', []), /native COM/);
});
