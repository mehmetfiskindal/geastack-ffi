// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { NativeRegistry } from '../dist/index.js';

test('NativeRegistry registers and invokes native embedded routines', () => {
  NativeRegistry.clear();

  let hardwarePin = -1;
  let hardwareState = false;

  NativeRegistry.register('gpio_write', (pin, high) => {
    hardwarePin = pin;
    hardwareState = high;
    return true;
  });

  assert.equal(NativeRegistry.has('gpio_write'), true);
  assert.equal(NativeRegistry.has('unknown_symbol'), false);

  const result = NativeRegistry.call('gpio_write', 4, true);
  assert.equal(result, true);
  assert.equal(hardwarePin, 4);
  assert.equal(hardwareState, true);

  NativeRegistry.clear();
});

test('NativeRegistry module registration', () => {
  NativeRegistry.clear();

  NativeRegistry.registerModule('wifi', {
    init: () => 'wifi_initialized',
    connect: (ssid) => `connected_to_${ssid}`,
  });

  assert.equal(NativeRegistry.has('wifi:init'), true);
  assert.equal(NativeRegistry.has('wifi:connect'), true);

  assert.equal(NativeRegistry.call('wifi:init'), 'wifi_initialized');
  assert.equal(NativeRegistry.call('wifi:connect', 'MyHomeWiFi'), 'connected_to_MyHomeWiFi');

  NativeRegistry.clear();
});
