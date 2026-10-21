// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { ObjC, Pointer } from '../dist/index.js';

const macOS = process.platform === 'darwin';

test('macOS Objective-C runtime is live', { skip: !macOS }, () => {
  assert.equal(ObjC.runtimeAvailable, true);
  assert.equal(ObjC.getClass('NSString').exists, true);
  assert.equal(ObjC.getClass('NSString').isNativeClass, true);
  assert.equal(ObjC.getClass('GEAFFINoSuchClass9f3a').exists, false);
  assert.equal(ObjC.getClass('GEAFFINoSuchClass9f3a').isNativeClass, false);
  assert.equal(ObjC.sel('stringWithUTF8String:').pointer.isNull(), false);
});

test('macOS Objective-C calls Foundation with an explicit signature', { skip: !macOS }, () => {
  const NSString = ObjC.getClass('NSString');

  const str = ObjC.send(NSString, 'stringWithUTF8String:', { args: ['string'], returns: 'id' }, 'geastack');
  assert.ok(str instanceof Pointer);
  assert.equal(str.isNull(), false);
  assert.equal(ObjC.objectClassName(str), 'NSTaggedPointerString');

  assert.equal(ObjC.send(str, 'UTF8String', { args: [], returns: 'string' }), 'geastack');
  assert.equal(ObjC.send(str, 'length', { args: [], returns: 'ulong' }), 8n);

  const description = ObjC.msgSend(str, 'description');
  assert.ok(description instanceof Pointer);
  assert.equal(ObjC.fromNSString(description), 'geastack');

  const processInfo = ObjC.sendClass('NSProcessInfo', 'processInfo', { args: [], returns: 'id' });
  assert.match(ObjC.objectClassName(processInfo), /ProcessInfo$/);
  assert.equal(ObjC.send(processInfo, 'processIdentifier', { args: [], returns: 'int' }), process.pid);

  const number = ObjC.send(ObjC.getClass('NSNumber'), 'numberWithInt:', { args: ['int'], returns: 'id' }, -42);
  assert.equal(ObjC.send(number, 'intValue', { args: [], returns: 'int' }), -42);
  assert.equal(ObjC.send(number, 'doubleValue', { args: [], returns: 'double' }), -42);
});

test('macOS string arguments and returns keep UTF-8 intact', { skip: !macOS }, () => {
  const NSString = ObjC.getClass('NSString');

  const text = ObjC.send(NSString, 'stringWithUTF8String:', { args: ['string'], returns: 'id' }, 'héllo ');
  const mutable = ObjC.send(text, 'mutableCopy', { args: [], returns: 'id' });
  const tail = ObjC.send(NSString, 'stringWithUTF8String:', { args: ['string'], returns: 'id' }, 'dünya 🌍');
  ObjC.send(mutable, 'appendString:', { args: ['id'], returns: 'void' }, tail);

  assert.equal(ObjC.send(mutable, 'UTF8String', { args: [], returns: 'string' }), 'héllo dünya 🌍');

  const owned = ObjC.toNSString('native üretim');
  assert.equal(ObjC.fromNSString(owned), 'native üretim');
  ObjC.release(owned);
  ObjC.release(mutable);
});

test('macOS object lifecycle uses alloc, init, retain, and release', { skip: !macOS }, () => {
  const NSObject = ObjC.getClass('NSObject');
  const instance = NSObject.new();
  assert.equal(instance.pointer.isNull(), false);
  assert.equal(ObjC.objectClassName(instance.pointer), 'NSObject');

  ObjC.retain(instance.pointer);
  const description = ObjC.fromNSString(instance.call('description'));
  assert.match(description, /^<NSObject: 0x[0-9a-f]+>$/);
  instance.release();
  instance.release();
});

test('macOS typed calls reject simulated pointers and wrong arity', { skip: !macOS }, () => {
  const simulated = new Pointer(0x60000000n);
  assert.throws(
    () => ObjC.send(simulated, 'description', { args: [], returns: 'id' }),
    /simulated heap address/
  );
  assert.throws(
    () => ObjC.send(ObjC.getClass('NSString'), 'stringWithUTF8String:', { args: [], returns: 'id' }, 'value'),
    /expects 0 argument/
  );
  assert.throws(
    () => ObjC.msgSend(ObjC.getClass('NSString').pointer, 'stringWithUTF8String:', 'value'),
    /use ObjC\.send/
  );
  assert.throws(
    () => ObjC.sendClass('GEAFFINoSuchClass9f3a', 'anything', { args: [], returns: 'id' }),
    /not registered/
  );

  // Nil messaging is defined as a no-op.
  assert.equal(ObjC.send(Pointer.NULL, 'description', { args: [], returns: 'id' }).isNull(), true);
  assert.equal(ObjC.send(Pointer.NULL, 'length', { args: [], returns: 'ulong' }), 0n);
  assert.equal(ObjC.send(Pointer.NULL, 'UTF8String', { args: [], returns: 'string' }), '');
});
