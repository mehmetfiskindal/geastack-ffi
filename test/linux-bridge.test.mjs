// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  POSIX,
  Sysfs,
  DBus,
  ERRNO,
  registerMockFunction,
} from '../dist/index.js';

test('POSIX errno, strerror, and ioctl device control', () => {
  POSIX.setErrno(ERRNO.ENOENT);
  assert.equal(POSIX.getErrno(), 2);
  assert.equal(POSIX.strerror(), 'No such file or directory');

  // Invalid fd sets EBADF
  assert.equal(POSIX.ioctl(-1, 0x0703, 0x48), -1);
  assert.equal(POSIX.getErrno(), ERRNO.Ebadf);

  // Register I2C_SLAVE (0x0703) ioctl handler
  const I2C_SLAVE = 0x0703;
  let boundSlaveAddress = 0;
  POSIX.registerIoctlHandler(I2C_SLAVE, (_fd, _req, arg) => {
    boundSlaveAddress = Number(arg);
    return 0;
  });

  const res = POSIX.ioctl(4, I2C_SLAVE, 0x76);
  assert.equal(res, 0);
  assert.equal(boundSlaveAddress, 0x76);
});

test('POSIX openSystemLibrary resolves lib*.so and binds functions', () => {
  registerMockFunction('libudev.so', 'udev_new', () => 0x550000n);

  const udev = POSIX.openSystemLibrary('udev', {
    udev_new: {
      args: [],
      returns: 'pointer',
    },
  });

  assert.equal(udev.path, 'libudev.so');
  assert.equal(udev.symbols.udev_new(), 0x550000n);
  udev.close();
});

test('Sysfs virtual kernel file reading for Linux battery and thermal sensors', () => {
  Sysfs.registerMockFile('/sys/class/power_supply/BAT0/capacity', '92\n');
  Sysfs.registerMockFile('/sys/class/power_supply/BAT0/status', 'Discharging\n');
  Sysfs.registerMockFile('/sys/class/thermal/thermal_zone0/temp', '46500\n');

  assert.equal(Sysfs.readInt('/sys/class/power_supply/BAT0/capacity'), 92);
  assert.equal(Sysfs.read('/sys/class/power_supply/BAT0/status'), 'Discharging');
  assert.equal(Sysfs.readInt('/sys/class/thermal/thermal_zone0/temp'), 46500);
});

test('DBus proxy method invocation, properties, and signals (UPower / Desktop Notifications)', () => {
  const service = 'org.freedesktop.UPower';
  const path = '/org/freedesktop/UPower/devices/battery_BAT0';
  const iface = 'org.freedesktop.UPower.Device';

  DBus.registerProperty(service, path, iface, 'Percentage', 84.5);
  DBus.registerProperty(service, path, iface, 'IsPresent', true);
  DBus.registerMethodHandler(service, path, iface, 'Refresh', () => true);

  const upowerBattery = DBus.getProxy('system', service, path, iface);
  assert.equal(upowerBattery.getProperty('Percentage'), 84.5);
  assert.equal(upowerBattery.getProperty('IsPresent'), true);
  assert.equal(upowerBattery.callMethod('Refresh'), true);

  let changedProp = null;
  const unsubscribe = upowerBattery.onSignal('PropertiesChanged', (prop, val) => {
    changedProp = { prop, val };
  });

  DBus.emitSignal(service, path, iface, 'PropertiesChanged', 'Percentage', 83.0);
  assert.deepEqual(changedProp, { prop: 'Percentage', val: 83.0 });

  unsubscribe();
});
