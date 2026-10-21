// SPDX-License-Identifier: Apache-2.0
/**
 * Build and execute the Objective-C/FFI runtime test on an iOS simulator.
 *
 * This is a real run on the iOS simulator runtime (not just a compile check).
 * It uses the same gea_ffi_apple_* wrappers as the device build. A physical
 * device still requires a signed app.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'build', 'ios-sim');
const includeDir = path.join(root, 'include');

if (process.platform !== 'darwin') {
  console.log('ios sim: skipped (requires macOS with Xcode)');
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

const listed = capture('xcrun', ['simctl', 'list', 'devices', 'available', '--json']);
if (!listed) {
  console.log('ios sim: skipped (simctl is not available)');
  process.exit(0);
}

let device;
try {
  const parsed = JSON.parse(listed);
  const runtime = Object.keys(parsed.devices || {}).find((key) => key.includes('.iOS-'));
  if (runtime) {
    device = (parsed.devices[runtime] || []).find((entry) => entry.name.includes('iPhone') && entry.isAvailable !== false);
  }
} catch {
  device = undefined;
}

if (!device) {
  console.log('ios sim: skipped (no available iPhone simulator)');
  process.exit(0);
}

const sdk = capture('xcrun', ['--sdk', 'iphonesimulator', '--show-sdk-path']);
if (!sdk) {
  console.log('ios sim: skipped (no iphonesimulator SDK)');
  process.exit(0);
}

mkdirSync(outDir, { recursive: true });
const executable = path.join(outDir, 'ios_sim_test');

run('xcrun', [
  '--sdk', 'iphonesimulator', 'clang++',
  '-std=c++17',
  '-fobjc-arc',
  '-fblocks',
  '-Wall',
  '-Wextra',
  '-arch', 'arm64',
  '-isysroot', sdk,
  '-mios-simulator-version-min=15.0',
  '-I', includeDir,
  path.join(root, 'src/native/gea_ffi_core.cpp'),
  path.join(root, 'src/native/gea_ffi_apple.mm'),
  path.join(root, 'src/native/gea_ffi_embedded.cpp'),
  path.join(root, 'fixtures/apple/ios_sim_test.mm'),
  '-framework', 'Foundation',
  '-o', executable,
]);

const wasBooted = device.state === 'Booted';
try {
  if (!wasBooted) {
    run('xcrun', ['simctl', 'boot', device.udid]);
    run('xcrun', ['simctl', 'bootstatus', device.udid, '-b']);
  }
  run('xcrun', ['simctl', 'spawn', device.udid, executable]);
  console.log(`ios sim ok (${device.name}, ${device.state === 'Booted' ? 'already booted' : 'booted for this test'})`);
} finally {
  if (!wasBooted) {
    spawnSync('xcrun', ['simctl', 'shutdown', device.udid], { cwd: root, stdio: 'ignore' });
  }
}
