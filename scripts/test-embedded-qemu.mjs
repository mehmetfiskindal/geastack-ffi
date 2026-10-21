// SPDX-License-Identifier: Apache-2.0
/**
 * Build the freestanding Cortex-M3 registry fixture and run it on QEMU's
 * mps2-an385 machine with ARM semihosting.
 *
 * Requires arm-none-eabi-g++ and qemu-system-arm, or Docker with network
 * access to install QEMU in a disposable node:22-bookworm container.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'build', 'embedded-qemu');
const elf = path.join(outDir, 'test.elf');

function has(command, args = []) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'ignore' });
  return !result.error && result.status === 0;
}

function run(command, args, capture = false) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  return { result, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

const compiler = process.env.ARM_GXX || 'arm-none-eabi-g++';
if (!has(compiler, ['--version'])) {
  console.log('embedded qemu: skipped (arm-none-eabi-g++ is not installed)');
  process.exit(0);
}

mkdirSync(outDir, { recursive: true });
const build = run(compiler, [
  '-mcpu=cortex-m3', '-mthumb', '-O2', '-g',
  '-ffreestanding', '-fno-exceptions', '-fno-rtti', '-fno-threadsafe-statics', '-fno-use-cxa-atexit',
  '-nostdlib', '-Wl,--gc-sections', `-Wl,-Map=${path.join(outDir, 'test.map')}`,
  '-T', path.join(root, 'fixtures/embedded/mps2.ld'),
  '-I', path.join(root, 'include'),
  path.join(root, 'src/native/gea_ffi_embedded.cpp'),
  path.join(root, 'fixtures/embedded/qemu_mps2.cpp'),
  '-o', elf,
]);
if (!build.result || build.result.status !== 0) {
  console.error('embedded qemu: compilation failed');
  process.exit(build.result?.status || 1);
}
if (!existsSync(elf)) {
  console.error('embedded qemu: no ELF produced');
  process.exit(1);
}

const qemuArgs = [
  '-M', 'mps2-an385', '-cpu', 'cortex-m3', '-nographic', '-semihosting', '-kernel', elf,
];
if (has('qemu-system-arm', ['--version'])) {
  const runResult = run('qemu-system-arm', qemuArgs, true);
  process.stdout.write(runResult.output);
  if (!runResult.output.includes('qemu_embedded ok')) {
    console.error('embedded qemu: Cortex-M3 test failed');
    process.exit(1);
  }
  console.log('embedded qemu: Cortex-M3 ok');
  process.exit(0);
}

if (!has('docker', ['--version'])) {
  console.log('embedded qemu: built ELF; skipped runtime (qemu-system-arm and docker are missing)');
  process.exit(0);
}

const container = run('docker', [
  'run', '--rm', '-v', `${root}:/work:ro`, '-w', '/work', 'node:22-bookworm', 'bash', '-lc',
  'apt-get update -qq >/dev/null && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends qemu-system-arm >/dev/null && ' +
  'timeout 15s qemu-system-arm -M mps2-an385 -cpu cortex-m3 -nographic -semihosting -kernel build/embedded-qemu/test.elf',
], true);
process.stdout.write(container.output);
if (!container.output.includes('qemu_embedded ok')) {
  console.error('embedded qemu: Docker Cortex-M3 test failed');
  process.exit(1);
}
console.log('embedded qemu: Cortex-M3 ok (Docker)');
