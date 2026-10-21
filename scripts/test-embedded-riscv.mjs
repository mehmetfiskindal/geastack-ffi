// SPDX-License-Identifier: Apache-2.0
/**
 * Build the rv32imc registry fixture with clang/lld and run it on QEMU virt.
 * QEMU's RISC-V test device does not terminate reliably in all versions, so
 * the test watches UART output and stops the machine once "qemu_riscv ok" is
 * printed. Requires Docker (the RISC-V toolchain is not installed on the host).
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docker = spawnSync('docker', ['--version'], { cwd: root, stdio: 'ignore' });
if (docker.error || docker.status !== 0) {
  console.log('embedded riscv: skipped (docker is not installed)');
  process.exit(0);
}

const script = `
set -e
apt-get update -qq >/dev/null
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends clang lld binutils-riscv64-unknown-elf qemu-system-misc >/dev/null
mkdir -p /work/build/embedded-riscv
clang++ --target=riscv32-unknown-elf -march=rv32imc -mabi=ilp32 -O2 -g \
  -ffreestanding -fno-exceptions -fno-rtti -fno-threadsafe-statics \
  -Wno-c++17-extensions -nostdlib -fuse-ld=lld \
  -Wl,-T,/work/fixtures/embedded/riscv_virt.ld -Wl,--gc-sections \
  -I /work/include /work/src/native/gea_ffi_embedded.cpp /work/fixtures/embedded/qemu_riscv.cpp \
  -o /work/build/embedded-riscv/test.elf
qemu-system-riscv32 -M virt -bios none -kernel /work/build/embedded-riscv/test.elf -nographic >/tmp/qemu-riscv.log 2>&1 &
pid=$!
for i in $(seq 1 50); do
  if grep -q 'qemu_riscv ok' /tmp/qemu-riscv.log 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
    cat /tmp/qemu-riscv.log
    exit 0
  fi
  sleep 0.2
done
cat /tmp/qemu-riscv.log
exit 1
`;

const result = spawnSync('docker', [
  'run', '--rm', '-v', `${root}:/work`, '-w', '/work', 'node:22-bookworm', 'bash', '-lc', script,
], { cwd: root, encoding: 'utf8' });

const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
process.stdout.write(output);
if (result.error || (result.status !== 0 && !output.includes('qemu_riscv ok'))) {
  console.error('embedded riscv: rv32imc QEMU test failed');
  process.exit(result.status || 1);
}
console.log('embedded riscv: rv32imc ok');
