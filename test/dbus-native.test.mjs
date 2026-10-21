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

  let observed = null;
  const unwatch = MCE.onDisplayStatusChanged((status) => {
    observed = status;
  });
  MCE.addDisplayStatusMatch();
  assert.equal(proxy.callMethod('EmitDisplayStatus'), undefined);
  assert.equal(MCE.nextDisplayStatus(2000), 'off');
  assert.equal(observed, 'off');
  unwatch();
  DBus.close();
});

test('Sailfish NGFD plays and stops through native D-Bus', { skip: !withService }, () => {
  NGFD.addStatusMatch();
  const eventId = NGFD.play('touch', { 'media.Vibra': true, volume: 80 });
  assert.equal(eventId, 42);
  assert.equal(NGFD.isPlaying(42), true);
  assert.equal(NGFD.pause(42, true), true);
  assert.equal(NGFD.pause(42, false), true);

  assert.deepEqual(NGFD.nextStatus(2000), { eventId: 42, status: 1 });
  assert.equal(NGFD.isPlaying(42), false);

  assert.equal(NGFD.stop(42), true);
  assert.equal(NGFD.isPlaying(42), false);
  DBus.close();
});

test('D-Bus string arrays round-trip through a method', { skip: !withService }, () => {
  const proxy = DBus.getProxy(
    'session',
    'com.geastack.GeaFfiStrings',
    '/com/geastack/GeaFfiStrings',
    'com.geastack.GeaFfiStrings'
  );
  assert.deepEqual(proxy.callMethod('EchoStrings', DBus.stringArray(['alpha', 'beta'])), ['alpha', 'beta']);
  assert.deepEqual(proxy.callMethod('EchoStrings', DBus.stringArray([])), []);
  DBus.close();
});

test('D-Bus string arrays arrive through signals', { skip: !withService }, () => {
  const proxy = DBus.getProxy(
    'session',
    'com.geastack.GeaFfiStrings',
    '/com/geastack/GeaFfiStrings',
    'com.geastack.GeaFfiStrings'
  );
  let observed = null;
  const unwatch = proxy.onSignal('Strings', (...args) => {
    observed = args[0];
  });
  DBus.addMatch("type='signal',interface='com.geastack.GeaFfiStrings',member='Strings'", 'session');
  assert.equal(proxy.callMethod('EmitStrings', DBus.stringArray(['x', 'y'])), undefined);

  let signal = DBus.nextSignal('session', 2000);
  for (let i = 0; i < 8 && signal && signal.interfaceName !== 'com.geastack.GeaFfiStrings'; i++) {
    signal = DBus.nextSignal('session', 500);
  }
  assert.equal(signal?.member, 'Strings');
  assert.deepEqual(signal?.args[0], ['x', 'y']);
  assert.deepEqual(observed, ['x', 'y']);
  unwatch();
  DBus.close();
});

test('D-Bus byte arrays round-trip through a method', { skip: !withService }, () => {
  const proxy = DBus.getProxy(
    'session',
    'com.geastack.GeaFfiStrings',
    '/com/geastack/GeaFfiStrings',
    'com.geastack.GeaFfiStrings'
  );
  const payload = new Uint8Array([0, 1, 2, 254, 255]);
  assert.deepEqual(proxy.callMethod('EchoBytes', DBus.byteArray(payload)), payload);
  assert.deepEqual(proxy.callMethod('EchoBytes', DBus.byteArray(new Uint8Array())), new Uint8Array());
  DBus.close();
});

test('D-Bus dictionaries round-trip through a method', { skip: !withService }, () => {
  const proxy = DBus.getProxy(
    'session',
    'com.geastack.GeaFfiStrings',
    '/com/geastack/GeaFfiStrings',
    'com.geastack.GeaFfiStrings'
  );
  assert.deepEqual(
    proxy.callMethod('EchoDict', DBus.dictionary({ name: 'gea', count: 42, enabled: true, tags: ['a', 'b'] })),
    { name: 'gea', count: 42, enabled: true, tags: ['a', 'b'] }
  );
  DBus.close();
});

test('D-Bus GetAll returns a property dictionary', { skip: !withService }, () => {
  const proxy = DBus.getProxy(
    'session',
    'com.geastack.GeaFfiTest',
    '/com/geastack/GeaFfiTest',
    'com.geastack.GeaFfiTest'
  );
  assert.deepEqual(proxy.getAllProperties(), {
    TestString: 'updated-by-ts',
    TestUint32: 777,
  });
  DBus.close();
});

test('D-Bus object-path arrays round-trip through a method', { skip: !withService }, () => {
  const proxy = DBus.getProxy(
    'session',
    'com.geastack.GeaFfiStrings',
    '/com/geastack/GeaFfiStrings',
    'com.geastack.GeaFfiStrings'
  );
  assert.deepEqual(
    proxy.callMethod('EchoPaths', DBus.objectPathArray(['/com/geastack/A', '/com/geastack/B'])),
    ['/com/geastack/A', '/com/geastack/B']
  );
  DBus.close();
});

test('D-Bus string dictionaries round-trip through a method', { skip: !withService }, () => {
  const proxy = DBus.getProxy(
    'session',
    'com.geastack.GeaFfiStrings',
    '/com/geastack/GeaFfiStrings',
    'com.geastack.GeaFfiStrings'
  );
  assert.deepEqual(
    proxy.callMethod('EchoStringDict', DBus.stringDictionary({ first: 'one', second: 'two' })),
    { first: 'one', second: 'two' }
  );
  DBus.close();
});

test('D-Bus int32 arrays round-trip through a method', { skip: !withService }, () => {
  const proxy = DBus.getProxy(
    'session',
    'com.geastack.GeaFfiStrings',
    '/com/geastack/GeaFfiStrings',
    'com.geastack.GeaFfiStrings'
  );
  assert.deepEqual(proxy.callMethod('EchoInts', DBus.int32Array([7, -8, 2147483647])), [7, -8, 2147483647]);
  DBus.close();
});
