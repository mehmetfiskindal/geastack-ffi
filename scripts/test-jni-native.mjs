// SPDX-License-Identifier: Apache-2.0
/**
 * Build and run the Android/JNI native bridge against a host JVM.
 *
 * The same `gea_ffi_android.cpp` source is cross-compiled for Android by
 * `scripts/build-android-native.mjs`. This test starts a real JVM through the
 * JNI invocation API and calls Java methods through the C ABI.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'build', 'jni-host');
const classesDir = path.join(outDir, 'classes');
const includeDir = path.join(root, 'include');

if (process.platform === 'win32') {
  console.error('JNI native test: Windows is not supported by this host test.');
  process.exit(2);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', ...options });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function capture(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) return '';
  return result.stdout.trim();
}

let javaHome = process.env.JAVA_HOME || '';
if (!javaHome && process.platform === 'darwin') {
  javaHome = capture('/usr/libexec/java_home', []);
}
if (!javaHome) {
  const javac = capture('which', ['javac']);
  if (javac) {
    javaHome = path.resolve(path.dirname(javac), '..');
  }
}
if (!javaHome || !existsSync(path.join(javaHome, 'bin', 'javac'))) {
  console.error('JNI native test: no JDK found. Set JAVA_HOME or install a JDK.');
  process.exit(2);
}

const osInclude = process.platform === 'darwin' ? 'darwin' : 'linux';
const platformInclude = path.join(javaHome, 'include', osInclude);
const jvmDir = path.join(javaHome, 'lib', 'server');
const jvmLibrary = process.platform === 'darwin' ? 'libjvm.dylib' : 'libjvm.so';
if (!existsSync(path.join(jvmDir, jvmLibrary))) {
  console.error(`JNI native test: ${path.join(jvmDir, jvmLibrary)} was not found.`);
  process.exit(2);
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(classesDir, { recursive: true });

run(path.join(javaHome, 'bin', 'javac'), [
  '-d', classesDir,
  path.join(root, 'fixtures/android/GeaJniTest.java'),
]);

const jniFlags = [
  '-std=c++17',
  '-DGEA_ENABLE_JNI',
  '-Wall',
  '-Wextra',
  '-I', includeDir,
  '-I', path.join(javaHome, 'include'),
  '-I', platformInclude,
];

const androidObject = path.join(outDir, 'gea_ffi_android.o');
const testObject = path.join(outDir, 'jni_host_test.o');
run('clang++', [...jniFlags, '-c', path.join(root, 'src/native/gea_ffi_android.cpp'), '-o', androidObject]);
run('clang++', [...jniFlags, '-c', path.join(root, 'fixtures/android/jni_host_test.cpp'), '-o', testObject]);

const executable = path.join(outDir, 'jni_test');
run('clang++', [
  '-o', executable,
  androidObject,
  testObject,
  '-L', jvmDir,
  '-ljvm',
  `-Wl,-rpath,${jvmDir}`,
]);

run(executable, [classesDir]);
