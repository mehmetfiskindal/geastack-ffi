// SPDX-License-Identifier: Apache-2.0
/**
 * Build the host libdbus bridge and run the TypeScript DBus test against a
 * private session bus.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

if (process.platform !== 'linux') {
  console.log('dbus ts native: skipped (Linux only)');
  process.exit(0);
}

function available(command, args = []) {
  const result = spawnSync(command, args, { cwd: root });
  return !result.error && result.status === 0;
}

if (!available('pkg-config', ['--exists', 'dbus-1'])) {
  console.log('dbus ts native: skipped (pkg-config dbus-1 is not installed)');
  process.exit(0);
}
if (!available('which', ['dbus-run-session'])) {
  console.log('dbus ts native: skipped (dbus-run-session is not installed)');
  process.exit(0);
}

function run(command, args, env = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(process.execPath, [path.join(root, 'scripts/build-dbus-host-lib.mjs')]);

const library = path.join(
  root,
  'build',
  'dbus-native',
  process.platform === 'darwin' ? 'libgea_ffi_dbus.dylib' : 'libgea_ffi_dbus.so'
);

run('dbus-run-session', ['--', process.execPath, '--test', 'test/dbus-native.test.mjs'], {
  GEA_FFI_DBUS_LIBRARY: library,
});
