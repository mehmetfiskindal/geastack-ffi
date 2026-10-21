// SPDX-License-Identifier: Apache-2.0
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'build', 'loader-test');
const includeDir = path.join(root, 'include');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    ...options,
  });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function compileWithGpp(extraSources, libraries) {
  const compiler = process.platform === 'darwin' ? 'clang++' : 'g++';
  const sources = [
    'src/native/gea_ffi_core.cpp',
    'src/native/gea_ffi_embedded.cpp',
    ...extraSources,
    'fixtures/loader/loader_test.cpp',
  ];
  const objects = sources.map((source) => {
    const object = path.join(outDir, `${path.basename(source, path.extname(source))}.o`);
    const language = source.endsWith('.mm') ? ['-x', 'objective-c++', '-fobjc-arc'] : [];
    run(compiler, ['-std=c++17', ...language, '-I', includeDir, '-c', path.join(root, source), '-o', object]);
    return object;
  });
  const executable = path.join(outDir, 'loader_test');
  run(compiler, ['-o', executable, ...objects, ...libraries]);
  run(executable, []);
}

function compileWithMsvc() {
  const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const vswhere = path.join(programFilesX86, 'Microsoft Visual Studio', 'Installer', 'vswhere.exe');
  if (!existsSync(vswhere)) {
    console.error('C++ loader test: no Visual Studio C++ compiler was found.');
    process.exit(2);
  }
  const located = spawnSync(vswhere, [
    '-latest',
    '-products', '*',
    '-requires', 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64',
    '-property', 'installationPath',
  ], { encoding: 'utf8' });
  const installPath = located.stdout?.trim();
  if (!installPath) {
    console.error('C++ loader test: no Visual Studio C++ compiler was found.');
    process.exit(2);
  }
  const vcvars = path.join(installPath, 'VC', 'Auxiliary', 'Build', 'vcvars64.bat');
  const sources = [
    'src/native/gea_ffi_core.cpp',
    'src/native/gea_ffi_embedded.cpp',
    'src/native/gea_ffi_windows.cpp',
    'fixtures/loader/loader_test.cpp',
  ].map((source) => `"${path.join(root, source)}"`).join(' ');
  const executable = path.join(outDir, 'loader_test.exe');
  const command = `call "${vcvars}" && cl /nologo /std:c++17 /EHsc /I "${includeDir}" ${sources} /Fo"${outDir}\\" /Fe"${executable}" ole32.lib advapi32.lib user32.lib && "${executable}"`;
  run('cmd.exe', ['/d', '/s', '/c', command]);
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

if (process.platform === 'linux') {
  compileWithGpp(
    ['src/native/gea_ffi_linux.cpp', 'src/native/gea_ffi_sailfishos.cpp'],
    ['-ldl', '-pthread'],
  );
} else if (process.platform === 'darwin') {
  compileWithGpp(['src/native/gea_ffi_apple.mm'], ['-framework', 'Foundation']);
} else if (process.platform === 'win32') {
  compileWithMsvc();
} else {
  console.error(`C++ loader test: unsupported host '${process.platform}'.`);
  process.exit(2);
}
