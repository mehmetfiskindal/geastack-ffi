// SPDX-License-Identifier: Apache-2.0
/**
 * Build the native Objective-C global block helper.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'build', 'apple-block');
const library = path.join(outDir, 'libgea_apple_block.dylib');

if (process.platform !== 'darwin') {
  console.log('apple block: skipped (macOS only)');
  process.exit(0);
}
mkdirSync(outDir, { recursive: true });
const compiler = process.env.CC || 'clang';
const result = spawnSync(compiler, [
  '-dynamiclib', '-fPIC', '-O2', '-Wall', '-Wextra',
  path.join(root, 'fixtures/apple/block_helper.c'),
  '-o', library,
], { cwd: root, stdio: 'inherit' });
if (result.error || result.status !== 0) {
  console.error('apple block: helper compilation failed');
  process.exit(result.status || 1);
}
if (!existsSync(library)) {
  console.error('apple block: helper was not produced');
  process.exit(1);
}
console.log(`apple block: ${path.relative(root, library)}`);
