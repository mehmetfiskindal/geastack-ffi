// SPDX-License-Identifier: Apache-2.0
/**
 * Build and run the libdbus bridge test under a private session bus.
 *
 * Requires pkg-config `dbus-1` and `dbus-run-session`. Skips cleanly when the
 * development package or the bus tooling is not installed.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'build', 'dbus-native');
const includeDir = path.join(root, 'include');

if (process.platform !== 'linux') {
  console.log('dbus native: skipped (the libdbus test runs on Linux)');
  process.exit(0);
}

function capture(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8' });
  if (result.error || result.status !== 0) return null;
  return result.stdout.trim();
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (spawnSync('pkg-config', ['--exists', 'dbus-1'], { cwd: root }).status !== 0) {
  console.log('dbus native: skipped (pkg-config dbus-1 is not installed)');
  process.exit(0);
}
if (!capture('which', ['dbus-run-session'])) {
  console.log('dbus native: skipped (dbus-run-session is not installed)');
  process.exit(0);
}

const pkgFlags = (capture('pkg-config', ['--cflags', '--libs', 'dbus-1']) || '').split(/\s+/).filter(Boolean);
const compiler = process.env.CXX || (existsSync('/usr/bin/c++') ? 'c++' : 'clang++');

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const executable = path.join(outDir, 'dbus_test');
run(compiler, [
  '-std=c++17',
  '-Wall',
  '-Wextra',
  '-I', includeDir,
  path.join(root, 'src/native/gea_ffi_dbus.cpp'),
  path.join(root, 'fixtures/linux/dbus_test.cpp'),
  ...pkgFlags,
  '-o', executable,
]);

run('dbus-run-session', ['--', executable]);
