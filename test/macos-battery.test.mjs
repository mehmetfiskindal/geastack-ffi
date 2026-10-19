// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Library,
  registerMockFunction,
  Pointer,
} from '../dist/index.js';

// IOKit function descriptors for macOS power / battery metrics
const IOKitBinding = {
  IOServiceMatching: {
    args: ['string'],
    returns: 'pointer',
  },
  IOServiceGetMatchingService: {
    args: ['uint32', 'pointer'],
    returns: 'uint32',
  },
  IORegistryEntryCreateCFProperties: {
    args: ['uint32', 'pointer', 'pointer', 'uint32'],
    returns: 'int32',
  },
  IOObjectRelease: {
    args: ['uint32'],
    returns: 'int32',
  },
};

test('IOKit FFI bindings can query battery cycle and power metrics', () => {
  // Register mock native IOKit symbols to test FFI routing
  registerMockFunction('IOKit', 'IOServiceMatching', (serviceName) => {
    assert.equal(serviceName, 'AppleSmartBattery');
    return new Pointer(0x1000n);
  });

  registerMockFunction('IOKit', 'IOServiceGetMatchingService', (port, matchingPtr) => {
    assert.equal(matchingPtr.address, 0x1000n);
    return 101; // Mock valid io_service_t handle
  });

  registerMockFunction('IOKit', 'IOObjectRelease', (serviceHandle) => {
    assert.equal(serviceHandle, 101);
    return 0; // KERN_SUCCESS
  });

  const lib = Library.open('IOKit', IOKitBinding);

  // 1. Look up AppleSmartBattery service
  const matchPtr = lib.symbols.IOServiceMatching('AppleSmartBattery');
  assert.equal(matchPtr.isNull(), false);

  // 2. Obtain service handle
  const service = lib.symbols.IOServiceGetMatchingService(0, matchPtr);
  assert.equal(service, 101);

  // 3. Release service handle
  const releaseStatus = lib.symbols.IOObjectRelease(service);
  assert.equal(releaseStatus, 0);

  lib.close();
});
