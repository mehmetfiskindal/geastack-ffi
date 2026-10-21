// SPDX-License-Identifier: Apache-2.0
/**
 * Build the libdconf bridge as a shared library for the Node host.
 *
 * The TypeScript DConf helper loads it when GEA_FFI_DCONF_LIBRARY is set or
 * build/dconf-native/libgea_ffi_dconf.{so,dylib} exists.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'build', 'dconf-native');
const includeDir = path.join(root, 'include');

if (process.platform !== 'linux' && process.platform !== 'darwin') {
  console.error('DConf host library: only Linux and macOS are supported.');
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

if (spawnSync('pkg-config', ['--exists', 'dconf'], { cwd: root }).status !== 0) {
  console.error('DConf host library: pkg-config dconf is not installed.');
  process.exit(2);
}

const flags = (capture('pkg-config', ['--cflags', '--libs', 'dconf']) || '').split(/\s+/).filter(Boolean);
const compiler = process.env.CXX || (existsSync('/usr/bin/c++') ? 'c++' : 'clang++');
const extension = process.platform === 'darwin' ? 'dylib' : 'so';
mkdirSync(outDir, { recursive: true });
const output = path.join(outDir, `libgea_ffi_dconf.${extension}`);

run(compiler, [
  '-std=c++17',
  process.platform === 'darwin' ? '-dynamiclib' : '-shared',
  '-fPIC',
  '-O2',
  '-Wall',
  '-Wextra',
  '-DGEA_FFI_HAS_DCONF=1',
  '-I', includeDir,
  path.join(root, 'src/native/gea_ffi_dconf.cpp'),
  ...flags,
  '-o', output,
]);

const symbols = capture('nm', ['-g', output]) || '';
for (const symbol of ['gea_ffi_dconf_read', 'gea_ffi_dconf_write', 'gea_ffi_dconf_reset', 'gea_ffi_dconf_available']) {
  if (!symbols.includes(symbol)) {
    console.error(`DConf host library: ${symbol} is missing from ${output}`);
    process.exit(1);
  }
}

console.log(`dconf host library: ${path.relative(root, output)}`);
