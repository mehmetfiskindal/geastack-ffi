// SPDX-License-Identifier: Apache-2.0
/**
 * Cross-compile the GeaStack FFI native library for Android ABIs.
 *
 * Uses the NDK toolchain directly so no Gradle project is required. Produces
 * static archives for arm64-v8a, armeabi-v7a, and x86_64 and checks that the
 * JNI bridge symbols are exported.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outRoot = path.join(root, 'build', 'android-native');
const includeDir = path.join(root, 'include');
const apiLevel = '24';

function capture(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8' });
  if (result.error || result.status !== 0) return '';
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

function findNdk() {
  const candidates = [
    process.env.ANDROID_NDK_HOME,
    process.env.ANDROID_NDK_ROOT,
    process.env.NDK_HOME,
  ].filter(Boolean);

  const sdkRoots = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    path.join(os.homedir(), 'Library/Android/sdk'),
    path.join(os.homedir(), 'Android/Sdk'),
  ].filter(Boolean);

  for (const sdk of sdkRoots) {
    const ndkDir = path.join(sdk, 'ndk');
    if (existsSync(ndkDir)) {
      for (const entry of readdirSync(ndkDir).sort().reverse()) {
        candidates.push(path.join(ndkDir, entry));
      }
    }
  }

  return candidates.find((candidate) => existsSync(path.join(candidate, 'toolchains', 'llvm'))) || null;
}

const ndk = findNdk();
if (!ndk) {
  console.error('Android native build: no NDK found. Set ANDROID_NDK_HOME or install the NDK.');
  process.exit(2);
}

const prebuiltRoot = path.join(ndk, 'toolchains', 'llvm', 'prebuilt');
const hostDir = readdirSync(prebuiltRoot)[0];
if (!hostDir) {
  console.error('Android native build: the NDK has no prebuilt toolchain.');
  process.exit(2);
}
const binDir = path.join(prebuiltRoot, hostDir, 'bin');
const toolchain = (name) => path.join(binDir, name);

const targets = [
  { abi: 'arm64-v8a', compiler: `aarch64-linux-android${apiLevel}-clang++` },
  { abi: 'armeabi-v7a', compiler: `armv7a-linux-androideabi${apiLevel}-clang++` },
  { abi: 'x86_64', compiler: `x86_64-linux-android${apiLevel}-clang++` },
];

const sources = [
  'src/native/gea_ffi_core.cpp',
  'src/native/gea_ffi_embedded.cpp',
  'src/native/gea_ffi_android.cpp',
  'src/native/gea_ffi_call.cpp',
];

rmSync(outRoot, { recursive: true, force: true });

for (const target of targets) {
  const compiler = toolchain(target.compiler);
  if (!existsSync(compiler)) {
    console.error(`Android native build: missing toolchain ${compiler}`);
    process.exit(2);
  }

  const outDir = path.join(outRoot, target.abi);
  mkdirSync(outDir, { recursive: true });

  const objects = [];
  for (const source of sources) {
    const object = path.join(outDir, `${path.basename(source, path.extname(source))}.o`);
    run(compiler, [
      '-std=c++17',
      '-fPIC',
      '-O2',
      '-Wall',
      '-Wextra',
      '-I', includeDir,
      '-c', path.join(root, source),
      '-o', object,
    ]);
    objects.push(object);
  }

  const archive = path.join(outDir, 'libgea_ffi.a');
  run(toolchain('llvm-ar'), ['rcs', archive, ...objects]);

  const symbols = capture(toolchain('llvm-nm'), ['-g', archive]);
  for (const symbol of ['gea_ffi_dlopen', 'gea_ffi_android_call_static', 'gea_ffi_android_find_class']) {
    if (!symbols.includes(symbol)) {
      console.error(`Android native build: ${target.abi} is missing ${symbol}`);
      process.exit(1);
    }
  }

  console.log(`android native: ${target.abi} -> ${path.relative(root, archive)} (${path.basename(ndk)})`);
}

console.log('android native ok (arm64-v8a, armeabi-v7a, x86_64)');
