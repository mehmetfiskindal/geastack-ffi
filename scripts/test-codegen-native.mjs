// SPDX-License-Identifier: Apache-2.0
/**
 * Compile the generated platform bridges with real compilers.
 *
 * This closes the old "codegen output was not compiled" gap. Missing optional
 * toolchains (JDK, MinGW, iOS SDK) are reported as skips, not failures.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  defineStruct,
  generateCHeader,
  generateAppleObjCpp,
  generateAndroidJni,
  generateWindowsBridge,
  generateLinuxBridge,
  generateSailfishBridge,
} from '../dist/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'build', 'codegen-native');
const includeDir = path.join(root, 'include');

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const Point = defineStruct('GeaSmokePoint', {
  x: 'int32',
  y: 'int32',
});

const options = {
  moduleName: 'gea_codegen_smoke',
  structs: { Point },
  functions: {
    smoke_void: { args: [], returns: 'void' },
    smoke_scalars: {
      args: ['int8', 'uint8', 'int16', 'uint16', 'int32', 'uint32', 'int64', 'uint64', 'float', 'double', 'bool'],
      returns: 'int32',
    },
    smoke_strings: { args: ['string', 'wstring', 'buffer', 'pointer'], returns: 'string' },
    smoke_point: { args: [Point, Point], returns: 'double' },
    smoke_make_point: { args: [], returns: Point },
  },
};

function write(name, contents) {
  const file = path.join(outDir, name);
  writeFileSync(file, contents + '\n');
  return file;
}

const header = write('gea_codegen_smoke.h', generateCHeader(options));
const apple = write('apple_bridge.mm', generateAppleObjCpp(options));
const android = write('android_bridge.cpp', generateAndroidJni(options, 'com.geastack.app', 'NativeBridge'));
const windows = write('windows_bridge.cpp', generateWindowsBridge(options));
const linux = write('linux_bridge.cpp', generateLinuxBridge(options));
const sailfish = write('sailfish_bridge.cpp', generateSailfishBridge(options));

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8' });
  if (result.error) return { ok: false, skipped: true, detail: result.error.message };
  if (result.status !== 0) {
    return { ok: false, skipped: false, detail: (result.stderr || result.stdout || '').trim() };
  }
  return { ok: true, skipped: false, detail: '' };
}

function which(command) {
  const finder = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(finder, [command], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim().split(/\r?\n/)[0] : '';
}

const results = [];
function record(name, outcome) {
  results.push({ name, ...outcome });
  if (outcome.skipped) console.log(`[skip] ${name}: ${outcome.detail}`);
  else if (outcome.ok) console.log(`[ok]   ${name}`);
  else {
    console.error(`[FAIL] ${name}`);
    console.error(outcome.detail);
  }
}

// 1. C header.
const cc = process.env.CC || 'cc';
if (which(cc) || which('clang') || which('gcc')) {
  const compiler = which(cc) || which('clang') || 'gcc';
  record('C header', run(compiler, ['-std=c11', '-fsyntax-only', '-x', 'c', '-I', outDir, header]));
} else {
  record('C header', { skipped: true, detail: 'no C compiler' });
}

// 2. Apple Objective-C++ (macOS and iOS simulator).
if (process.platform === 'darwin') {
  record('Apple Objective-C++', run('clang++', [
    '-std=c++17', '-fobjc-arc', '-I', outDir, '-c', apple, '-o', path.join(outDir, 'apple_bridge.o'),
  ]));

  const sdk = spawnSync('xcrun', ['--sdk', 'iphonesimulator', '--show-sdk-path'], { encoding: 'utf8' });
  if (sdk.status === 0) {
    record('iOS Objective-C++', run('xcrun', [
      '--sdk', 'iphonesimulator', 'clang++',
      '-std=c++17', '-fobjc-arc', '-arch', 'arm64',
      '-isysroot', sdk.stdout.trim(),
      '-mios-simulator-version-min=15.0',
      '-I', outDir, '-c', apple, '-o', path.join(outDir, 'apple_bridge_ios.o'),
    ]));
  } else {
    record('iOS Objective-C++', { skipped: true, detail: 'no iphonesimulator SDK' });
  }
} else {
  record('Apple Objective-C++', { skipped: true, detail: 'requires macOS' });
  record('iOS Objective-C++', { skipped: true, detail: 'requires macOS' });
}

// 3. Android JNI.
function javaHome() {
  if (process.env.JAVA_HOME) return process.env.JAVA_HOME;
  if (process.platform === 'darwin') {
    const result = spawnSync('/usr/libexec/java_home', [], { encoding: 'utf8' });
    if (result.status === 0) return result.stdout.trim();
  }
  return '';
}

const jdk = javaHome();
if (jdk && existsSync(path.join(jdk, 'include', 'jni.h'))) {
  const platformInclude = process.platform === 'darwin' ? 'darwin' : process.platform === 'win32' ? 'win32' : 'linux';
  record('Android JNI', run('clang++', [
    '-std=c++17', '-I', outDir,
    '-I', path.join(jdk, 'include'), '-I', path.join(jdk, 'include', platformInclude),
    '-c', android, '-o', path.join(outDir, 'android_bridge.o'),
  ]));
} else {
  record('Android JNI', { skipped: true, detail: 'no JDK headers' });
}

// 4. Linux / Sailfish / Windows C++ bridges.
if (process.platform !== 'win32') {
  const hostCxx = process.env.CXX || (process.platform === 'darwin' ? 'clang++' : 'c++');
  for (const [name, file] of [['Linux bridge', linux], ['Sailfish bridge', sailfish]]) {
    record(name, run(hostCxx, [
      '-std=c++17', '-I', outDir, '-I', includeDir,
      '-c', file, '-o', path.join(outDir, `${path.basename(file, '.cpp')}.o`),
    ]));
  }
} else {
  record('Linux bridge', { skipped: true, detail: 'requires a POSIX host compiler' });
  record('Sailfish bridge', { skipped: true, detail: 'requires a POSIX host compiler' });
}

const mingw = which('x86_64-w64-mingw32-g++');
if (mingw) {
  record('Windows bridge (MinGW)', run(mingw, [
    '-std=c++17', '-I', outDir, '-c', windows, '-o', path.join(outDir, 'windows_bridge.o'),
  ]));
} else {
  record('Windows bridge (MinGW)', { skipped: true, detail: 'x86_64-w64-mingw32-g++ not installed' });
}

const failed = results.filter((entry) => !entry.ok && !entry.skipped);
const skipped = results.filter((entry) => entry.skipped);
console.log('');
console.log(`codegen native: ${results.length - failed.length - skipped.length} passed, ${skipped.length} skipped, ${failed.length} failed`);
if (failed.length > 0) process.exit(1);
console.log('codegen native ok');
