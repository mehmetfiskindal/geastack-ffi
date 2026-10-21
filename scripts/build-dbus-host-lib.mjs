// SPDX-License-Identifier: Apache-2.0
/**
 * Build the libdbus bridge as a shared library for the Node host.
 *
 * The TypeScript `DBus` module loads this library when GEA_FFI_DBUS_LIBRARY is
 * set or when build/dbus-native/libgea_ffi_dbus.{so,dylib} exists. The Android
 * and Sailfish targets compile the same source into the app instead.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'build', 'dbus-native');
const includeDir = path.join(root, 'include');

if (process.platform !== 'linux' && process.platform !== 'darwin') {
  console.error('D-Bus host library: only Linux and macOS are supported.');
  process.exit(2);
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
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (spawnSync('pkg-config', ['--exists', 'dbus-1'], { cwd: root }).status !== 0) {
  console.error('D-Bus host library: pkg-config dbus-1 is not installed.');
  process.exit(2);
}

const flags = (capture('pkg-config', ['--cflags', '--libs', 'dbus-1']) || '').split(/\s+/).filter(Boolean);
const compiler = process.env.CXX || (existsSync('/usr/bin/c++') ? 'c++' : 'clang++');
const extension = process.platform === 'darwin' ? 'dylib' : 'so';
mkdirSync(outDir, { recursive: true });
const output = path.join(outDir, `libgea_ffi_dbus.${extension}`);

run(compiler, [
  '-std=c++17',
  process.platform === 'darwin' ? '-dynamiclib' : '-shared',
  '-fPIC',
  '-O2',
  '-Wall',
  '-Wextra',
  '-I', includeDir,
  path.join(root, 'src/native/gea_ffi_dbus.cpp'),
  ...flags,
  '-o', output,
]);

const symbols = capture('nm', ['-g', output]) || '';
for (const symbol of ['gea_ffi_dbus_connect', 'gea_ffi_dbus_call', 'gea_ffi_dbus_disconnect']) {
  if (!symbols.includes(symbol)) {
    console.error(`D-Bus host library: ${symbol} is missing from ${output}`);
    process.exit(1);
  }
}

console.log(`dbus host library: ${path.relative(root, output)}`);
