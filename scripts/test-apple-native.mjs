// SPDX-License-Identifier: Apache-2.0
/**
 * Build and run the native Apple/Objective-C backend test on macOS.
 *
 * The same `.mm` source is compiled for iOS by `scripts/build-ios-native.mjs`.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'build', 'apple-test');
const includeDir = path.join(root, 'include');

if (process.platform !== 'darwin') {
  console.error('Apple native test: this test requires macOS.');
  process.exit(2);
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

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const executable = path.join(outDir, 'apple_test');
run('clang++', [
  '-std=c++17',
  '-fobjc-arc',
  '-fblocks',
  '-Wall',
  '-Wextra',
  '-I', includeDir,
  path.join(root, 'src/native/gea_ffi_apple.mm'),
  path.join(root, 'fixtures/apple/apple_test.mm'),
  '-framework', 'Foundation',
  '-o', executable,
]);
run(executable, []);
