// SPDX-License-Identifier: Apache-2.0
/**
 * Build and run the libffi generic-call test.
 *
 * Requires pkg-config libffi and a POSIX host. Skips cleanly elsewhere.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'build', 'ffi-call');
const includeDir = path.join(root, 'include');

if (process.platform === 'win32') {
  console.log('ffi call: skipped on Windows (this host test uses dlopen)');
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
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (spawnSync('pkg-config', ['--exists', 'libffi'], { cwd: root }).status !== 0) {
  console.log('ffi call: skipped (pkg-config libffi is not installed)');
  process.exit(0);
}

const flags = (capture('pkg-config', ['--cflags', '--libs', 'libffi']) || '').split(/\s+/).filter(Boolean);
const compiler = process.env.CXX || (existsSync('/usr/bin/c++') ? 'c++' : 'clang++');
mkdirSync(outDir, { recursive: true });

const executable = path.join(outDir, 'ffi_call_test');
run(compiler, [
  '-std=c++17',
  '-Wall',
  '-Wextra',
  '-DGEA_FFI_HAS_LIBFFI=1',
  '-I', includeDir,
  path.join(root, 'src/native/gea_ffi_core.cpp'),
  path.join(root, 'src/native/gea_ffi_call.cpp'),
  path.join(root, 'fixtures/call/ffi_call_test.cpp'),
  ...flags,
  '-ldl',
  '-pthread',
  '-o', executable,
]);
run(executable, []);
