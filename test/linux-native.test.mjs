// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { closeSync, openSync, statSync, unlinkSync } from 'node:fs';
import { Sysfs, POSIX, ERRNO } from '../dist/index.js';

const linux = process.platform === 'linux';
const posix = process.platform === 'linux' || process.platform === 'darwin';

test('Linux sysfs reads /proc through libc', { skip: !linux }, () => {
  const version = Sysfs.read('/proc/version');
  assert.ok(version);
  assert.match(version, /^Linux version /);

  const pidMax = Sysfs.readInt('/proc/sys/kernel/pid_max');
  assert.equal(typeof pidMax, 'number');
  assert.ok(pidMax > 0);
});

test('POSIX sysfs writes, truncates, and reads a real temp file', { skip: !posix }, () => {
  const path = `/tmp/gea-ffi-sysfs-${process.pid}.txt`;
  try {
    assert.equal(Sysfs.write(path, 'héllo sysfs longer content\n'), true);
    assert.equal(Sysfs.read(path), 'héllo sysfs longer content');
    // Overwrite with a shorter value to verify O_TRUNC works on both Linux and macOS.
    assert.equal(Sysfs.write(path, 'short\n'), true);
    assert.equal(Sysfs.read(path), 'short');
    assert.equal(Sysfs.readInt(path), null);
    // Verify variadic open() passed mode 0o644 properly (owner read/write, no execute bits).
    const mode = statSync(path).mode & 0o777;
    assert.equal(mode & 0o600, 0o600);
    assert.equal(mode & 0o111, 0);
  } finally {
    try {
      unlinkSync(path);
    } catch {
      // The assertion result is what matters.
    }
  }
});

test('POSIX sysfs reports ENOENT for a missing file', { skip: !posix }, () => {
  assert.equal(Sysfs.read('/definitely/not/a/gea/ffi/file'), null);
  assert.equal(POSIX.getErrno(), ERRNO.ENOENT);
  assert.match(POSIX.strerror(), /No such file/);
});

test('POSIX ioctl calls libc and propagates errno', { skip: !posix }, () => {
  assert.equal(POSIX.ioctl(-1, 0x1234), -1);
  assert.equal(POSIX.getErrno(), ERRNO.EBADF);

  const fd = openSync('/dev/null', 'r');
  try {
    // /dev/null does not implement this request (ENOTTY on Linux, ENODEV/ENOTTY on macOS).
    assert.equal(POSIX.ioctl(fd, 0x12345678, 0), -1);
    if (linux) {
      assert.equal(POSIX.getErrno(), ERRNO.ENOTTY);
      assert.equal(POSIX.strerror(), 'Inappropriate ioctl for device');
    } else {
      assert.ok(POSIX.getErrno() === ERRNO.ENODEV || POSIX.getErrno() === ERRNO.ENOTTY);
    }
  } finally {
    closeSync(fd);
  }
});
