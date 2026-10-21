// SPDX-License-Identifier: Apache-2.0
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (process.platform !== 'darwin') {
  console.log('apple block: skipped (macOS only)');
  process.exit(0);
}
const build = spawnSync(process.execPath, [path.join(root, 'scripts/build-apple-block-lib.mjs')], {
  cwd: root,
  stdio: 'inherit',
});
if (build.error || build.status !== 0) process.exit(build.status || 1);

const test = spawnSync(process.execPath, ['--test', 'test/apple-block-native.test.mjs'], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    GEA_APPLE_BLOCK_TEST: '1',
    GEA_FFI_APPLE_BLOCK_LIBRARY: path.join(root, 'build', 'apple-block', 'libgea_apple_block.dylib'),
  },
});
if (test.error) {
  console.error(test.error.message);
  process.exit(1);
}
process.exit(test.status ?? 1);
