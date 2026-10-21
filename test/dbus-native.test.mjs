// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { DBus } from '../dist/index.js';

const native = DBus.nativeAvailable;

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
