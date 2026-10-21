// SPDX-License-Identifier: Apache-2.0
/**
 * Cross-compile the Windows native library with MinGW-w64.
 *
 * This validates the LoadLibraryW/GetProcAddress loader, the UTF-16 registry
 * helpers, the embedded registry, and the libffi stubs without running Windows.
 * A runtime check still needs the Windows demo on a Windows machine.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'build', 'windows-native');
const includeDir = path.join(root, 'include');

function which(command) {
  const finder = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(finder, [command], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim().split(/\r?\n/)[0] : '';
}

const compiler = which('x86_64-w64-mingw32-g++');
if (!compiler) {
  console.log('windows native: skipped (x86_64-w64-mingw32-g++ not installed)');
  process.exit(0);
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function capture(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8' });
  if (result.error || result.status !== 0) return '';
  return result.stdout;
}

mkdirSync(outDir, { recursive: true });

const sources = [
  'src/native/gea_ffi_core.cpp',
  'src/native/gea_ffi_embedded.cpp',
  'src/native/gea_ffi_windows.cpp',
  'src/native/gea_ffi_call.cpp',
];
const objects = [];
for (const source of sources) {
  const object = path.join(outDir, `${path.basename(source, path.extname(source))}.o`);
  run(compiler, ['-std=c++17', '-Wall', '-Wextra', '-I', includeDir, '-c', path.join(root, source), '-o', object]);
  objects.push(object);
}

const archive = path.join(outDir, 'libgea_ffi_windows.a');
run('x86_64-w64-mingw32-ar', ['rcs', archive, ...objects]);

const symbols = capture('x86_64-w64-mingw32-nm', ['-g', archive]);
for (const symbol of ['gea_ffi_dlopen', 'gea_ffi_dlsym', 'gea_ffi_embedded_register', 'gea_ffi_call_available']) {
  if (!symbols.includes(symbol)) {
    console.error(`windows native: ${symbol} is missing from ${archive}`);
    process.exit(1);
  }
}

console.log(`windows native ok (${path.relative(root, archive)})`);
