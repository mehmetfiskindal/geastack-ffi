// SPDX-License-Identifier: Apache-2.0
/**
 * Run the Android ART JNI fixture on a connected physical device.
 * Unlike test:android-emulator, this never boots an emulator.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const result = spawnSync(process.execPath, [path.join(root, 'scripts/test-android-emulator.mjs')], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, GEA_ANDROID_DEVICE_ONLY: '1' },
});
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
