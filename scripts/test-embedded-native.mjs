// SPDX-License-Identifier: Apache-2.0
/**
 * Build and run the allocation-free embedded registry test, then cross-compile
 * the registry and core for ARM Cortex-M targets (RP2350 / RP2040 class).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outRoot = path.join(root, 'build', 'embedded-native');
const includeDir = path.join(root, 'include');
const hostCompiler = process.env.CXX || (process.platform === 'darwin' ? 'clang++' : 'c++');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', ...options });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
  return result;
}

function capture(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8' });
  if (result.error || result.status !== 0) return '';
  return result.stdout.trim();
}

rmSync(outRoot, { recursive: true, force: true });

// 1. Host test: the table has no heap or STL dependency.
const hostDir = path.join(outRoot, 'host');
mkdirSync(hostDir, { recursive: true });
const hostExecutable = path.join(hostDir, 'embedded_test');
run(hostCompiler, [
  '-std=c++17',
  '-Wall',
  '-Wextra',
  '-I', includeDir,
  path.join(root, 'src/native/gea_ffi_embedded.cpp'),
  path.join(root, 'fixtures/embedded/registry_test.cpp'),
  '-o', hostExecutable,
]);
run(hostExecutable, []);

// 2. Cortex-M cross-compile: no OS, no exceptions, no thread-safe statics.
const armCompiler = capture('which', ['arm-none-eabi-g++']) || (existsSync('/opt/homebrew/bin/arm-none-eabi-g++')
  ? '/opt/homebrew/bin/arm-none-eabi-g++'
  : '');
if (!armCompiler) {
  console.log('embedded native: host ok (arm-none-eabi-g++ not installed; Cortex-M cross-compile skipped)');
  process.exit(0);
}

const targets = [
  { name: 'rp2350', cpu: 'cortex-m33', extra: [] },
  { name: 'rp2040', cpu: 'cortex-m0plus', extra: [] },
];

for (const target of targets) {
  const outDir = path.join(outRoot, target.name);
  mkdirSync(outDir, { recursive: true });
  const flags = [
    '-std=c++17',
    '-Os',
    '-ffreestanding',
    '-fno-exceptions',
    '-fno-rtti',
    '-fno-threadsafe-statics',
    '-fno-use-cxa-atexit',
    '-Wall',
    '-Wextra',
    `-mcpu=${target.cpu}`,
    '-mthumb',
    '-mfloat-abi=soft',
    '-I', includeDir,
    ...target.extra,
  ];

  const objects = [];
  // The registry is freestanding; the dlopen loader needs a C library and is
  // built by the firmware SDK instead, so it is not part of this bare-metal check.
  for (const source of [
    'src/native/gea_ffi_embedded.cpp',
    'fixtures/embedded/embedded_consumer.cpp',
  ]) {
    const object = path.join(outDir, `${path.basename(source, path.extname(source))}.o`);
    run(armCompiler, [...flags, '-c', path.join(root, source), '-o', object]);
    objects.push(object);
  }

  const archive = path.join(outDir, `libgea_ffi_${target.name}.a`);
  run('arm-none-eabi-ar', ['rcs', archive, ...objects]);

  const symbols = capture('arm-none-eabi-nm', ['-g', archive]);
  for (const symbol of [
    'gea_ffi_embedded_register',
    'gea_ffi_embedded_lookup',
    'gea_ffi_embedded_count',
    'gea_ffi_embedded_probe',
  ]) {
    if (!symbols.includes(symbol)) {
      console.error(`Embedded native build: ${target.name} is missing ${symbol}`);
      process.exit(1);
    }
  }
  console.log(`embedded native: ${target.name} (${target.cpu}) -> ${path.relative(root, archive)}`);
}

console.log('embedded native ok (host, rp2350, rp2040)');
