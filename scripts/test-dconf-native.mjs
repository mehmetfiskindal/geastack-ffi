// SPDX-License-Identifier: Apache-2.0
/**
 * Build the host libdconf bridge and run the TypeScript DConf test under a
 * private session bus with the dconf service activated on demand.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

if (process.platform !== 'linux') {
  console.log('dconf native: skipped (Linux only)');
  process.exit(0);
}

function available(command, args = []) {
  const result = spawnSync(command, args, { cwd: root });
  return !result.error && result.status === 0;
}

function run(command, args, env = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (!available('pkg-config', ['--exists', 'dconf']) || !available('which', ['dconf'])) {
  console.log('dconf native: skipped (libdconf or the dconf CLI is not installed)');
  process.exit(0);
}
if (!available('which', ['dbus-run-session'])) {
  console.log('dconf native: skipped (dbus-run-session is not installed)');
  process.exit(0);
}

run(process.execPath, [path.join(root, 'scripts/build-dconf-host-lib.mjs')]);

const library = path.join(root, 'build', 'dconf-native', 'libgea_ffi_dconf.so');
const command = [
  `export GEA_FFI_DCONF_LIBRARY=${JSON.stringify(library)}`,
  'export GEA_FFI_DCONF_NATIVE_TEST=1',
  `${JSON.stringify(process.execPath)} --test test/dconf-native.test.mjs`,
  'status=$?',
  'dconf reset -f /com/geastack/ffi_test/ 2>/dev/null || true',
  'exit $status',
].join('; ');

run('dbus-run-session', ['--', 'bash', '-c', command]);
