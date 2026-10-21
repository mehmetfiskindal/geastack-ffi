// SPDX-License-Identifier: Apache-2.0
/**
 * Build the Android JNI runtime fixture with the NDK and run it on a booted
 * emulator through app_process (ART). The test exercises libgea_ffi_android's
 * generic find-class/get-method/call-static/string bridge.
 *
 * Requirements: Android SDK with an arm64 emulator image, NDK, build-tools,
 * platform android.jar, and adb. Set GEA_ANDROID_AVD to use a specific AVD, or
 * leave it unset to use an already-running emulator.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'build', 'android-runtime');
const logDir = path.join(root, 'build', 'android-emulator');

function fail(message) {
  console.error(`android emulator: ${message}`);
  process.exit(1);
}

function capture(command, args, env = process.env) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', env });
  return result.status === 0 ? result.stdout.trim() : null;
}

function run(command, args, env = process.env, captureOutput = false) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    env,
    stdio: captureOutput ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  if (result.error || result.status !== 0) {
    fail(`${command} failed${result.stderr ? `: ${result.stderr.trim()}` : ''}`);
  }
  return result.stdout ?? '';
}

function newestDir(parent, predicate = () => true) {
  if (!existsSync(parent)) return null;
  const entries = readdirSync(parent, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && predicate(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  return entries.length ? path.join(parent, entries[0]) : null;
}

const sdkCandidates = [
  process.env.ANDROID_SDK_ROOT,
  process.env.ANDROID_HOME,
  path.join(root, '.android-sdk'),
  path.join(os.homedir(), 'Library', 'Android', 'sdk'),
  path.join(os.homedir(), 'Android', 'Sdk'),
].filter(Boolean);
const sdk = sdkCandidates.find((candidate) => existsSync(path.join(candidate, 'emulator')));
if (!sdk) fail('Android SDK/emulator not found. Set ANDROID_SDK_ROOT.');

const ndk = process.env.ANDROID_NDK_HOME
  ? process.env.ANDROID_NDK_HOME
  : newestDir(path.join(sdk, 'ndk'));
if (!ndk) fail('Android NDK not found. Set ANDROID_NDK_HOME.');

const hostTag = process.platform === 'darwin'
  ? (process.arch === 'arm64' ? 'darwin-x86_64' : 'darwin-x86_64')
  : 'linux-x86_64';
const ndkBin = path.join(ndk, 'toolchains', 'llvm', 'prebuilt', hostTag, 'bin');
const compiler = path.join(ndkBin, 'aarch64-linux-android24-clang++');
if (!existsSync(compiler)) fail(`NDK compiler not found at ${compiler}`);

const buildTools = newestDir(path.join(sdk, 'build-tools'), (name) => /^\d+\.\d+\.\d+$/.test(name));
const d8 = buildTools ? path.join(buildTools, 'd8') : null;
if (!d8 || !existsSync(d8)) fail('d8 not found in build-tools.');

const platform = newestDir(path.join(sdk, 'platforms'), (name) => /^android-\d+$/.test(name));
const androidJar = platform ? path.join(platform, 'android.jar') : null;
if (!androidJar || !existsSync(androidJar)) fail('android.jar not found in platforms.');

const adb = existsSync(path.join(sdk, 'platform-tools', 'adb'))
  ? path.join(sdk, 'platform-tools', 'adb')
  : 'adb';

mkdirSync(outDir, { recursive: true });
mkdirSync(logDir, { recursive: true });
const library = path.join(outDir, 'libgea_android_runtime_test.so');
const classesDir = path.join(outDir, 'classes');
const dexDir = path.join(outDir, 'dex');
mkdirSync(classesDir, { recursive: true });
mkdirSync(dexDir, { recursive: true });

run(compiler, [
  '-std=c++17', '-fPIC', '-shared', '-O2', '-static-libstdc++',
  '-I', path.join(root, 'include'),
  path.join(root, 'src/native/gea_ffi_android.cpp'),
  path.join(root, 'fixtures/android/runtime/android_runtime_test.cpp'),
  '-llog', '-o', library,
]);

run('javac', ['--release', '17', '-d', classesDir, path.join(root, 'fixtures/android/runtime/GeaAndroidRuntimeTest.java')]);
run(d8, ['--min-api', '24', '--lib', androidJar, '--output', dexDir,
  path.join(classesDir, 'com/geastack/GeaAndroidRuntimeTest.class')]);
const dex = path.join(dexDir, 'classes.dex');
if (!existsSync(dex)) fail('d8 did not produce classes.dex.');

const env = {
  ...process.env,
  ANDROID_HOME: sdk,
  ANDROID_SDK_ROOT: sdk,
  ANDROID_AVD_HOME: process.env.ANDROID_AVD_HOME || path.join(root, '.android-avd'),
  ANDROID_USER_HOME: process.env.ANDROID_USER_HOME || path.join(root, '.android-home'),
  TMPDIR: process.env.TMPDIR || path.join(root, '.android-tmp'),
  HOME: process.env.GEA_ANDROID_HOME || path.join(root, '.android-home'),
};
mkdirSync(env.ANDROID_AVD_HOME, { recursive: true });
mkdirSync(env.TMPDIR, { recursive: true });
mkdirSync(env.HOME, { recursive: true });

function emulatorDevices() {
  const output = capture(adb, ['devices'], env) || '';
  return output.split('\n').filter((line) => /\tdevice$/.test(line.trim())).map((line) => line.split('\t')[0]);
}

let started = false;
if (emulatorDevices().length === 0) {
  const avd = process.env.GEA_ANDROID_AVD || 'gea_arm';
  const ini = path.join(env.ANDROID_AVD_HOME, `${avd}.ini`);
  const emulator = path.join(sdk, 'emulator', 'emulator');
  if (!existsSync(emulator) || !existsSync(ini)) {
    console.log(`android emulator: skipped (no running emulator and no AVD '${avd}')`);
    process.exit(0);
  }
  const log = path.join(logDir, 'emulator.log');
  const child = spawn(emulator, [
    '-avd', avd, '-no-window', '-no-audio', '-no-boot-anim',
    '-gpu', 'swiftshader_indirect', '-no-snapshot', '-wipe-data',
  ], { cwd: root, env, detached: true, stdio: ['ignore', 'ignore', 'ignore'] });
  child.unref();
  writeFileSync(log, '');
  started = true;
  let booted = false;
  for (let i = 0; i < 120; i++) {
    const devices = emulatorDevices();
    if (devices.length > 0) {
      const boot = capture(adb, ['shell', 'getprop', 'sys.boot_completed'], env);
      if (boot && boot.trim() === '1') {
        booted = true;
        break;
      }
    }
    spawnSync('sleep', ['1']);
  }
  if (!booted) {
    if (started) capture(adb, ['emu', 'kill'], env);
    fail(`emulator did not boot; see ${path.relative(root, log)}`);
  }
}

const devices = emulatorDevices();
if (devices.length === 0) fail('no adb device.');
const serial = devices[0];
const adbEnv = { ...env, ANDROID_SERIAL: serial };

run(adb, ['push', library, '/data/local/tmp/libgea_android_runtime_test.so'], adbEnv);
run(adb, ['push', dex, '/data/local/tmp/gea_android_runtime.dex'], adbEnv);
run(adb, ['shell', 'chmod', '755', '/data/local/tmp/libgea_android_runtime_test.so'], adbEnv);
const output = run(adb, ['shell',
  'cd /data/local/tmp && CLASSPATH=/data/local/tmp/gea_android_runtime.dex app_process -Djava.library.path=/data/local/tmp /system/bin com.geastack.GeaAndroidRuntimeTest',
], adbEnv, true);

process.stdout.write(output);
if (!output.includes('android_jni_runtime ok')) {
  if (started) capture(adb, ['emu', 'kill'], adbEnv);
  fail('ART test did not print android_jni_runtime ok.');
}
if (started) capture(adb, ['emu', 'kill'], adbEnv);
console.log(`android emulator: ${serial} ok`);
