// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { DBus, MCE, NGFD } from '../dist/index.js';

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

test('DBus native backend receives signals', { skip: !withService }, () => {
  const rule = "type='signal',interface='com.geastack.GeaFfiTest'";
  DBus.addMatch(rule);

  const proxy = DBus.getProxy(
    'session',
    'com.geastack.GeaFfiTest',
    '/com/geastack/GeaFfiTest',
    'com.geastack.GeaFfiTest'
  );
  proxy.callMethod('EmitSignal');

  let signal = DBus.nextSignal('session', 2000);
  for (let i = 0; i < 8 && signal && signal.interfaceName !== 'com.geastack.GeaFfiTest'; i++) {
    signal = DBus.nextSignal('session', 500);
  }
  assert.ok(signal);
  assert.equal(signal.interfaceName, 'com.geastack.GeaFfiTest');
  assert.equal(signal.member, 'SomethingChanged');
  assert.equal(signal.path, '/com/geastack/GeaFfiTest');
  assert.deepEqual(signal.args, ['signal-payload', 99]);

  DBus.removeMatch(rule);
  DBus.close();
});

test('Sailfish MCE uses the native system D-Bus', { skip: !withService }, () => {
  assert.equal(MCE.getDisplayStatus(), 'dimmed');
  assert.equal(MCE.getBatteryLevel(), 73);
  assert.equal(MCE.getChargerState(), 'on');

  assert.equal(MCE.setPreventBlanking(true), true);
  assert.equal(MCE.isBlankingPrevented(), true);
  assert.equal(MCE.setPreventBlanking(false), true);
  assert.equal(MCE.isBlankingPrevented(), false);
  DBus.close();
});

test('Sailfish MCE receives native display status signals', { skip: !withService }, () => {
  const proxy = DBus.getProxy(
    'system',
    'com.nokia.mce',
    '/com/nokia/mce/request',
    'com.nokia.mce.request'
  );

  MCE.addDisplayStatusMatch();
  assert.equal(proxy.callMethod('EmitDisplayStatus'), undefined);
  assert.equal(MCE.nextDisplayStatus(2000), 'off');
  DBus.close();
});

test('Sailfish NGFD plays and stops through native D-Bus', { skip: !withService }, () => {
  const eventId = NGFD.play('touch', { 'media.Vibra': true, volume: 80 });
  assert.equal(eventId, 42);
  assert.equal(NGFD.isPlaying(42), true);

  assert.equal(NGFD.stop(42), true);
  assert.equal(NGFD.isPlaying(42), false);
  DBus.close();
});
