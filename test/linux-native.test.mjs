// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { closeSync, openSync, unlinkSync } from 'node:fs';
import { Sysfs, POSIX, ERRNO } from '../dist/index.js';

const linux = process.platform === 'linux';

test('Linux sysfs reads /proc through libc', { skip: !linux }, () => {
  const version = Sysfs.read('/proc/version');
  assert.ok(version);
  assert.match(version, /^Linux version /);

  const pidMax = Sysfs.readInt('/proc/sys/kernel/pid_max');
  assert.equal(typeof pidMax, 'number');
  assert.ok(pidMax > 0);
});

test('Linux sysfs writes and reads a real temp file', { skip: !linux }, () => {
  const path = `/tmp/gea-ffi-sysfs-${process.pid}.txt`;
  try {
    assert.equal(Sysfs.write(path, 'héllo sysfs\n'), true);
    assert.equal(Sysfs.read(path), 'héllo sysfs');
    assert.equal(Sysfs.readInt(path), null);
  } finally {
    try {
      unlinkSync(path);
    } catch {
      // The assertion result is what matters.
    }
  }
});

test('Linux sysfs reports ENOENT for a missing file', { skip: !linux }, () => {
  assert.equal(Sysfs.read('/definitely/not/a/gea/ffi/file'), null);
  assert.equal(POSIX.getErrno(), ERRNO.ENOENT);
  assert.match(POSIX.strerror(), /No such file/);
});

test('Linux ioctl calls libc and propagates errno', { skip: !linux }, () => {
  assert.equal(POSIX.ioctl(-1, 0x1234), -1);
  assert.equal(POSIX.getErrno(), ERRNO.EBADF);

  const fd = openSync('/dev/null', 'r');
  try {
    // /dev/null does not implement this request, so the kernel returns ENOTTY.
    assert.equal(POSIX.ioctl(fd, 0x12345678, 0), -1);
    assert.equal(POSIX.getErrno(), ERRNO.ENOTTY);
    assert.equal(POSIX.strerror(), 'Inappropriate ioctl for device');
  } finally {
    closeSync(fd);
  }
});
