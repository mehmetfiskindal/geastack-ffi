// SPDX-License-Identifier: Apache-2.0
/**
 * Run the platform-appropriate verification matrix in this workspace.
 * Physical-device runs and the Windows PC demo are intentionally separate.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const platform = process.platform;

const checks = [{ name: 'unit tests', script: 'test' }];

function has(command, args = []) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'ignore' });
  return !result.error && result.status === 0;
}


if (platform === 'linux') {
  checks.push(
    { name: 'loader', script: 'test:loader' },
    { name: 'C++ D-Bus', script: 'test:dbus-native' },
    { name: 'TypeScript D-Bus', script: 'test:dbus-ts-native' },
    { name: 'DConf', script: 'test:dconf-native' },
    { name: 'libffi calls', script: 'test:ffi-native' },
    { name: 'embedded registry', script: 'test:embedded-native' },
    { name: 'embedded QEMU', script: 'test:embedded-qemu' },
    { name: 'codegen', script: 'test:codegen-native' },
  );
  if (process.env.ANDROID_NDK_HOME || has('which', ['aarch64-linux-android24-clang++'])) {
    checks.push({ name: 'Android NDK', script: 'test:android-native' });
  } else {
    console.log('SKIP  Android NDK (set ANDROID_NDK_HOME to run)');
  }
  if (has('which', ['javac'])) {
    checks.push({ name: 'host JNI', script: 'test:jni-native' });
  } else {
    console.log('SKIP  host JNI (install a JDK to run)');
  }
  if (has('which', ['x86_64-w64-mingw32-g++'])) {
    checks.push({ name: 'Windows cross-compile', script: 'test:windows-native' });
  } else {
    console.log('SKIP  Windows cross-compile (install MinGW-w64 to run)');
  }
  if (process.env.GEA_VERIFY_WINE === '1') {
    checks.push({ name: 'Windows under Wine', script: 'test:windows-wine' });
  }
  if (process.env.GEA_VERIFY_ANDROID_EMULATOR === '1') {
    checks.push({ name: 'Android ART emulator', script: 'test:android-emulator' });
  }
} else if (platform === 'darwin') {
  checks.push(
    { name: 'Apple native', script: 'test:apple-native' },
    { name: 'iOS archives', script: 'test:ios' },
    { name: 'iOS simulator', script: 'test:ios-sim' },
    { name: 'host callbacks', script: 'test:callbacks' },
    { name: 'Objective-C blocks', script: 'test:apple-block' },
    { name: 'embedded QEMU', script: 'test:embedded-qemu' },
  );
} else if (platform === 'win32') {
  checks.push({ name: 'Windows demo', script: 'demo:windows' });
}

const results = [];
for (const check of checks) {
  const started = Date.now();
  console.log(`\n=== ${check.name} (npm run ${check.script}) ===`);
  const result = spawnSync('npm', ['run', check.script], { cwd: root, stdio: 'inherit' });
  results.push({
    name: check.name,
    script: check.script,
    ok: !result.error && result.status === 0,
    duration: Date.now() - started,
  });
}

console.log('\n=== verification summary ===');
for (const result of results) {
  console.log(`${result.ok ? 'PASS' : 'FAIL'}  ${result.name} (${(result.duration / 1000).toFixed(1)}s)`);
}
const failed = results.filter((result) => !result.ok);
console.log(`${results.length - failed.length}/${results.length} checks passed on ${platform}`);
process.exit(failed.length === 0 ? 0 : 1);
