// SPDX-License-Identifier: Apache-2.0
/**
 * Build the host libdbus bridge and run the TypeScript DBus test against a
 * private session bus.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
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

function capture(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8' });
  if (result.error || result.status !== 0) return null;
  return result.stdout.trim();
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

const flags = (capture('pkg-config', ['--cflags', '--libs', 'dbus-1']) || '').split(/\s+/).filter(Boolean);
const compiler = process.env.CXX || (existsSync('/usr/bin/c++') ? 'c++' : 'clang++');
const service = path.join(root, 'build', 'dbus-native', 'dbus_test_service');
run(compiler, [
  '-std=c++17',
  '-Wall',
  '-Wextra',
  path.join(root, 'fixtures/linux/dbus_test_service.cpp'),
  ...flags,
  '-o', service,
]);

const command = `"${service}" & service_pid=$!; sleep 1; `
  + `"${process.execPath}" --test test/dbus-native.test.mjs; status=$?; `
  + 'kill "$service_pid" 2>/dev/null || true; wait "$service_pid" 2>/dev/null || true; exit "$status"';

run('dbus-run-session', ['--', 'bash', '-c', command], {
  GEA_FFI_DBUS_LIBRARY: library,
  GEA_FFI_DBUS_NATIVE_TEST: '1',
  GEA_FFI_DBUS_TEST_SERVICE: '1',
});
