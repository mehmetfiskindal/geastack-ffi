// SPDX-License-Identifier: Apache-2.0
/**
 * Run the Windows demo under Wine.
 *
 * This is a smoke test, not a substitute for real Windows: it executes the
 * same kernel32/user32/advapi32/ole32 calls through Wine's implementations and
 * catches binding mistakes (for example, GetSystemMetrics lives in user32).
 *
 * Skips when Wine, curl, unzip, or the network is unavailable.
 */
import { spawnSync } from 'node:child_process';
import {
  closeSync,
  cpSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const work = path.join(root, 'build', 'wine-windows');
const bundle = path.join(work, 'bundle');
const nodeVersion = '22.23.2';
const nodeDir = path.join(work, `node-v${nodeVersion}-win-x64`);
const nodeExe = path.join(nodeDir, 'node.exe');
const nodeZip = path.join(work, 'node.zip');
const winePrefix = path.join(work, 'wine-prefix');

function which(command) {
  const finder = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(finder, [command], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim().split(/\r?\n/)[0] : '';
}

const wine = which('wine64') || which('wine');
if (!wine) {
  console.log('windows wine: skipped (wine64/wine not installed)');
  process.exit(0);
}
if (!which('curl') || !which('unzip') || !which('tar') || !which('npm')) {
  console.log('windows wine: skipped (curl, unzip, tar, or npm is missing)');
  process.exit(0);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', ...options });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

mkdirSync(work, { recursive: true });

if (!existsSync(nodeExe)) {
  if (!existsSync(nodeZip)) {
    const url = `https://nodejs.org/dist/v${nodeVersion}/node-v${nodeVersion}-win-x64.zip`;
    const download = spawnSync('curl', ['-fsSL', url, '-o', nodeZip], { cwd: root, stdio: 'inherit' });
    if (download.status !== 0) {
      console.log('windows wine: skipped (could not download the Windows Node.js runtime)');
      process.exit(0);
    }
  }
  run('unzip', ['-q', '-o', nodeZip, '-d', work]);
}

rmSync(bundle, { recursive: true, force: true });
mkdirSync(path.join(bundle, 'node_modules', '@koromix'), { recursive: true });
cpSync(path.join(root, 'dist'), path.join(bundle, 'dist'), { recursive: true });
cpSync(path.join(root, 'node_modules', 'koffi'), path.join(bundle, 'node_modules', 'koffi'), { recursive: true });

const demo = readFileSync(path.join(root, 'demos', 'windows-ffi', 'demo.mjs'), 'utf8')
  .replace("from '../../dist/index.js'", "from './dist/index.js'");
writeFileSync(path.join(bundle, 'demo.mjs'), demo);
writeFileSync(path.join(bundle, 'package.json'), `${JSON.stringify({ type: 'module' }, null, 2)}\n`);

const koffiVersion = JSON.parse(
  readFileSync(path.join(root, 'node_modules', 'koffi', 'package.json'), 'utf8')
).version;
const tarball = path.join(work, `koromix-koffi-win32-x64-${koffiVersion}.tgz`);
if (!existsSync(path.join(bundle, 'node_modules', '@koromix', 'koffi-win32-x64', 'win32_x64', 'koffi.node'))) {
  const pack = spawnSync('npm', [
    'pack', `@koromix/koffi-win32-x64@${koffiVersion}`,
    '--pack-destination', work,
    '--cache', path.join(root, '.npm-cache'),
  ], { cwd: root, stdio: 'ignore' });
  if (pack.status !== 0 || !existsSync(tarball)) {
    console.log('windows wine: skipped (could not fetch the koffi win32 prebuild)');
    process.exit(0);
  }
  run('tar', ['-xzf', tarball, '-C', path.join(bundle, 'node_modules', '@koromix')]);
  renameSync(
    path.join(bundle, 'node_modules', '@koromix', 'package'),
    path.join(bundle, 'node_modules', '@koromix', 'koffi-win32-x64')
  );
}

const outputFile = path.join(bundle, 'wine-out.txt');
const errorFile = path.join(bundle, 'wine-err.txt');
const outFd = openSync(outputFile, 'w');
const errFd = openSync(errorFile, 'w');
let result;
try {
  result = spawnSync(wine, [path.relative(bundle, nodeExe), 'demo.mjs'], {
    cwd: bundle,
    stdio: ['ignore', outFd, errFd],
    env: { ...process.env, WINEPREFIX: winePrefix, WINEDEBUG: '-all' },
  });
} finally {
  closeSync(outFd);
  closeSync(errFd);
}

const output = readFileSync(outputFile, 'utf8');
const errors = readFileSync(errorFile, 'utf8');
process.stdout.write(output);
if (errors.trim()) process.stderr.write(errors);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
if (result.status !== 0 || !output.includes('windows_demo ok')) {
  console.error('windows wine: the demo failed');
  process.exit(result.status || 1);
}
console.log('windows wine ok (Wine smoke test, not real Windows)');
