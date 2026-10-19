// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { ObjC, ObjCClass, Pointer } from '../dist/index.js';

test('ObjC class lookup and message sending', () => {
  const UIDevice = ObjC.getClass('UIDevice');
  assert.equal(UIDevice.name, 'UIDevice');
  assert.equal(UIDevice.pointer.isNull(), false);

  // Register mock handler for [UIDevice currentDevice]
  const mockDevicePtr = new Pointer(0x55555555n);
  ObjC.registerHandler('currentDevice', () => mockDevicePtr);
  ObjC.registerHandler(`${mockDevicePtr.toHex()}::systemVersion`, () => '18.0');

  const currentDevice = UIDevice.callStatic('currentDevice');
  assert.equal(currentDevice.address, mockDevicePtr.address);

  const version = ObjC.msgSend(currentDevice, 'systemVersion');
  assert.equal(version, '18.0');
});

test('ObjC selector registration', () => {
  const sel = ObjC.sel('tokenForcingRefresh:completion:');
  assert.equal(sel.name, 'tokenForcingRefresh:completion:');
  assert.equal(sel.pointer.isNull(), false);
});

test('ObjC block creation and invocation', () => {
  let callbackCalled = false;
  let receivedData = '';

  const blockPtr = ObjC.createBlock((data) => {
    callbackCalled = true;
    receivedData = data;
  });

  assert.equal(blockPtr.isNull(), false);

  // Invoke block
  ObjC.msgSend(blockPtr, 'invoke', 'test-token-value');
  assert.equal(callbackCalled, true);
  assert.equal(receivedData, 'test-token-value');
});
