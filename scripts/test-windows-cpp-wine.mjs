// SPDX-License-Identifier: Apache-2.0
/**
 * Compile the native Windows C++ backend with MinGW and execute a small test
 * under Wine. This checks the C++ API independently of the Node/koffi demo.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'build', 'windows-cpp');
const exe = path.join(outDir, 'windows_native_test.exe');

function has(command, args = []) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'ignore' });
  return !result.error && result.status === 0;
}

if (!has('docker', ['--version'])) {
  console.log('windows cpp: skipped (docker is not installed)');
  process.exit(0);
}
const wine = has('wine64', ['--version']) ? 'wine64' : has('wine', ['--version']) ? 'wine' : '';
if (!wine) {
  console.log('windows cpp: skipped (wine is not installed)');
  process.exit(0);
}

mkdirSync(outDir, { recursive: true });
const compile = spawnSync('docker', [
  'run', '--rm', '-v', `${root}:/work`, '-w', '/work', 'node:22-bookworm', 'bash', '-lc',
  'apt-get update -qq >/dev/null && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends g++-mingw-w64-x86-64 >/dev/null && ' +
  'mkdir -p build/windows-cpp && ' +
  'x86_64-w64-mingw32-g++ -std=c++17 -O2 -static -static-libgcc -static-libstdc++ ' +
  '-I include src/native/gea_ffi_windows.cpp fixtures/windows/native_test.cpp ' +
  '-lole32 -ladvapi32 -o build/windows-cpp/windows_native_test.exe',
], { cwd: root, stdio: 'inherit' });
if (compile.error || compile.status !== 0 || !existsSync(exe)) {
  console.error('windows cpp: MinGW compilation failed');
  process.exit(compile.status || 1);
}

const run = spawnSync(wine, [exe], {
  cwd: root,
  encoding: 'utf8',
  env: {
    ...process.env,
    WINEDEBUG: '-all',
    WINEPREFIX: process.env.WINEPREFIX || path.join(root, 'build', 'wine-windows', 'wine-prefix'),
  },
});
const output = `${run.stdout ?? ''}${run.stderr ?? ''}`;
process.stdout.write(output);
if (run.error || !output.includes('windows_native_test ok')) {
  console.error('windows cpp: Wine test failed');
  process.exit(run.status || 1);
}
console.log('windows cpp: native ok (Wine)');
