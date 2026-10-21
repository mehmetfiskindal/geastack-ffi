// SPDX-License-Identifier: Apache-2.0
/**
 * Cross-compile the GeaStack FFI native library for iOS.
 *
 * Builds a static archive for the simulator and device SDKs, compiles a header
 * consumer against each SDK, and verifies the exported C symbols. This is a
 * compile/link check; executing on a device requires a signed app.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outRoot = path.join(root, 'build', 'ios-native');
const includeDir = path.join(root, 'include');
const minimumVersion = '15.0';

if (process.platform !== 'darwin') {
  console.error('iOS native build: this check requires macOS with Xcode.');
  process.exit(2);
}

function capture(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8' });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.stderr.write(result.stderr || '');
    process.exit(result.status ?? 1);
  }
  return result.stdout.trim();
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

const targets = [
  { sdk: 'iphonesimulator', arch: 'arm64', minimum: `-mios-simulator-version-min=${minimumVersion}` },
  { sdk: 'iphonesimulator', arch: 'x86_64', minimum: `-mios-simulator-version-min=${minimumVersion}` },
  { sdk: 'iphoneos', arch: 'arm64', minimum: `-miphoneos-version-min=${minimumVersion}` },
];

const sources = [
  'src/native/gea_ffi_core.cpp',
  'src/native/gea_ffi_apple.mm',
  'src/native/gea_ffi_embedded.cpp',
  'src/native/gea_ffi_call.cpp',
];

rmSync(outRoot, { recursive: true, force: true });

const sdkPaths = new Map();
const built = [];

for (const target of targets) {
  if (!sdkPaths.has(target.sdk)) {
    sdkPaths.set(target.sdk, capture('xcrun', ['--sdk', target.sdk, '--show-sdk-path']));
  }
  const sdkPath = sdkPaths.get(target.sdk);
  const outDir = path.join(outRoot, `${target.sdk}-${target.arch}`);
  mkdirSync(outDir, { recursive: true });

  const objects = [];
  for (const source of sources) {
    const object = path.join(outDir, `${path.basename(source, path.extname(source))}.o`);
    run('xcrun', [
      '--sdk', target.sdk, 'clang++',
      '-std=c++17',
      '-fobjc-arc',
      '-fblocks',
      '-Wall',
      '-Wextra',
      '-arch', target.arch,
      '-isysroot', sdkPath,
      target.minimum,
      '-I', includeDir,
      '-c', path.join(root, source),
      '-o', object,
    ]);
    objects.push(object);
  }

  const consumer = path.join(outDir, 'ios_consumer.o');
  run('xcrun', [
    '--sdk', target.sdk, 'clang++',
    '-std=c++17',
    '-fobjc-arc',
    '-fblocks',
    '-Wall',
    '-Wextra',
    '-arch', target.arch,
    '-isysroot', sdkPath,
    target.minimum,
    '-I', includeDir,
    '-c', path.join(root, 'fixtures/apple/ios_consumer.mm'),
    '-o', consumer,
  ]);
  objects.push(consumer);

  const archive = path.join(outDir, 'libgea_ffi.a');
  run('xcrun', ['--sdk', target.sdk, 'libtool', '-static', '-o', archive, ...objects]);

  const symbols = capture('xcrun', ['--sdk', target.sdk, 'nm', '-gU', archive]);
  for (const symbol of ['_gea_ffi_dlopen', '_gea_ffi_dlsym', '_gea_ffi_apple_msg_send_id_str', '_gea_ffi_ios_consumer']) {
    if (!symbols.includes(symbol)) {
      console.error(`iOS native build: ${target.sdk}-${target.arch} is missing ${symbol}`);
      process.exit(1);
    }
  }

  built.push(`${target.sdk}-${target.arch}`);
  console.log(`ios native: ${target.sdk}-${target.arch} -> ${path.relative(root, archive)}`);
}

console.log(`ios native ok (${built.join(', ')})`);
