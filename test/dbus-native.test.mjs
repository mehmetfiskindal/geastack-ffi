// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { DBus } from '../dist/index.js';

const native = DBus.nativeAvailable && process.env.GEA_FFI_DBUS_NATIVE_TEST === '1';
const withService = native && process.env.GEA_FFI_DBUS_TEST_SERVICE === '1';

test('DBus native backend reports availability', { skip: !native }, () => {
  assert.equal(DBus.nativeAvailable, true);
});

test('DBus native backend calls org.freedesktop.DBus', { skip: !native }, () => {
  const proxy = DBus.getProxy(
    'session',
    'org.freedesktop.DBus',
    '/org/freedesktop/DBus',
    'org.freedesktop.DBus'
  );

  assert.equal(proxy.callMethod('NameHasOwner', 'org.freedesktop.DBus'), true);
  assert.equal(proxy.callMethod('GetNameOwner', 'org.freedesktop.DBus'), 'org.freedesktop.DBus');

  const id = proxy.callMethod('GetId');
  assert.equal(typeof id, 'string');
  assert.ok(id.length > 0);

  const pid = proxy.callMethod('GetConnectionUnixProcessID', 'org.freedesktop.DBus');
  assert.equal(typeof pid, 'number');
  assert.ok(pid > 0);

  assert.throws(() => proxy.callMethod('NoSuchMethod'), /does not understand|failed/);

  // The connection stays usable after a method error.
  assert.equal(proxy.callMethod('NameHasOwner', 'org.freedesktop.DBus'), true);
  DBus.close();
});

test('DBus simulation handlers still take precedence', { skip: !native }, () => {
  DBus.registerMethodHandler(
    'com.example.GeaFfi',
    '/com/example/GeaFfi',
    'com.example.GeaFfi',
    'Ping',
    (value) => `pong:${value}`
  );

  const proxy = DBus.getProxy('session', 'com.example.GeaFfi', '/com/example/GeaFfi', 'com.example.GeaFfi');
  assert.equal(proxy.callMethod('Ping', 'native'), 'pong:native');
  DBus.close();
});

test('DBus native backend reads properties through Properties.Get', { skip: !withService }, () => {
  const proxy = DBus.getProxy(
    'session',
    'com.geastack.GeaFfiTest',
    '/com/geastack/GeaFfiTest',
    'com.geastack.GeaFfiTest'
  );

  assert.equal(proxy.getProperty('TestString'), 'hello-from-service');
  assert.equal(proxy.getProperty('TestUint32'), 4242);
  assert.throws(() => proxy.getProperty('Missing'), /no such property|failed/);
  DBus.close();
});

test('DBus native backend writes properties through Properties.Set', { skip: !withService }, () => {
  const proxy = DBus.getProxy(
    'session',
    'com.geastack.GeaFfiTest',
    '/com/geastack/GeaFfiTest',
    'com.geastack.GeaFfiTest'
  );

  proxy.setProperty('TestString', 'updated-by-ts');
  assert.equal(proxy.getProperty('TestString'), 'updated-by-ts');

  proxy.setProperty('TestUint32', DBus.uint32(777));
  assert.equal(proxy.getProperty('TestUint32'), 777);
  DBus.close();
});
