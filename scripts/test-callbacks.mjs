// SPDX-License-Identifier: Apache-2.0
/**
 * Build the callback fixture as a host shared library and run the callback test.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'build', 'callbacks');
const includeDir = path.join(root, 'include');

if (process.platform === 'win32') {
  console.log('callbacks: skipped on Windows (the fixture build uses a POSIX compiler)');
  process.exit(0);
}

const compiler = process.env.CC || (existsSync('/usr/bin/cc') ? 'cc' : 'clang');
mkdirSync(outDir, { recursive: true });
const extension = process.platform === 'darwin' ? 'dylib' : 'so';
const library = path.join(outDir, `libgea_callbacks.${extension}`);

const build = spawnSync(compiler, [
  process.platform === 'darwin' ? '-dynamiclib' : '-shared',
  '-fPIC',
  '-O2',
  '-Wall',
  '-Wextra',
  '-I', includeDir,
  path.join(root, 'fixtures/callbacks/callback_lib.c'),
  '-o', library,
], { cwd: root, stdio: 'inherit' });
if (build.error || build.status !== 0) {
  console.error('callbacks: fixture compilation failed');
  process.exit(build.status || 1);
}

const test = spawnSync(process.execPath, ['--test', 'test/callbacks.test.mjs'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, GEA_CALLBACK_LIBRARY: library },
});
if (test.error) {
  console.error(test.error.message);
  process.exit(1);
}
process.exit(test.status ?? 1);
