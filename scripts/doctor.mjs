// SPDX-License-Identifier: Apache-2.0
/**
 * Report which host toolchains are available for the platform checks.
 * This does not run tests; it only inspects commands and environment.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function command(name, args = ['--version']) {
  const result = spawnSync(name, args, { cwd: root, stdio: 'ignore' });
  return !result.error && result.status === 0;
}

function version(name, args = ['--version']) {
  const result = spawnSync(name, args, { cwd: root, encoding: 'utf8' });
  if (result.error || result.status !== 0) return '';
  return `${result.stdout || result.stderr}`.trim().split(/\r?\n/)[0];
}

const checks = [
  ['Node.js', command(process.execPath, ['--version']), process.version],
  ['npm', command('npm', ['--version']), version('npm')],
  ['Docker', command('docker', ['--version']), version('docker')],
  ['Wine', command('wine64', ['--version']) || command('wine', ['--version']), version('wine64') || version('wine')],
  ['QEMU ARM', command('qemu-system-arm', ['--version']), version('qemu-system-arm')],
  ['ARM GCC', command('arm-none-eabi-g++', ['--version']), version('arm-none-eabi-g++')],
  ['JDK javac', command('javac', ['-version']), version('javac', ['-version'])],
  ['MinGW', command('x86_64-w64-mingw32-g++', ['--version']), version('x86_64-w64-mingw32-g++')],
];

if (process.platform === 'darwin') {
  checks.push(['Xcode simulator', command('xcrun', ['simctl', 'list', 'devices']), version('xcodebuild', ['-version'])]);
}

const sdkRoot = process.env.ANDROID_SDK_ROOT || process.env.ANDROID_HOME || path.join(root, '.android-sdk');
let ndk = process.env.ANDROID_NDK_HOME || process.env.NDK_HOME || '';
const ndkRoot = path.join(sdkRoot, 'ndk');
if (!ndk && existsSync(ndkRoot)) {
  const entries = spawnSync('find', [ndkRoot, '-maxdepth', '1', '-mindepth', '1', '-type', 'd'], { encoding: 'utf8' });
  ndk = (entries.stdout || '').split('\n').filter(Boolean).sort().pop() || '';
}
checks.push(['Android SDK', existsSync(sdkRoot), sdkRoot]);
checks.push(['Android NDK', Boolean(ndk && existsSync(ndk)), ndk || 'set ANDROID_NDK_HOME']);

console.log(`doctor: ${process.platform} ${process.arch}, Node ${process.version}, ${os.release()}`);
console.log('tool                    status   detail');
for (const [name, ok, detail] of checks) {
  console.log(`${String(ok ? 'READY' : 'MISSING').padEnd(8)} ${name.padEnd(20)} ${detail || ''}`);
}
console.log('\nMissing tools only skip their platform checks; see npm run verify.');
