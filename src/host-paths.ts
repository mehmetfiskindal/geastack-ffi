// SPDX-License-Identifier: Apache-2.0
/**
 * Resolves the helper shared libraries that the host backends load at runtime
 * (libdbus bridge, libdconf bridge, Apple block helper).
 *
 * Those libraries are produced by the `build:*` scripts into the repository's
 * `build/` directory. They are intentionally resolved relative to this package
 * instead of `process.cwd()`: loading a `.so`/`.dylib` from the directory a user
 * happens to launch an app from lets a planted library run inside the process.
 *
 * Resolution order:
 * 1. An explicit environment override, e.g. `GEA_FFI_DBUS_LIBRARY`.
 * 2. `<packageRoot>/build/<buildDirectory>/<name>`.
 *
 * When neither exists the caller falls back to the simulated backend.
 */

/** Convert a `file:` URL to a filesystem path without importing Node builtins. */
function fileUrlToPath(href: string): string | null {
  if (!href.startsWith('file:')) return null;
  let path = decodeURIComponent(href.slice('file:'.length));
  // `file:///dir` yields three leading slashes; keep `//host/share` UNC paths.
  path = path.replace(/^\/{3,}/, '/');
  // Windows file URLs look like `file:///C:/dir/`; drop the leading slash.
  if (/^\/[A-Za-z]:[\\/]/.test(path)) path = path.slice(1);
  return path;
}

const packageRoot = (() => {
  try {
    // `dist/host-paths.js` and `src/host-paths.ts` both sit one level below the
    // package root, so a single `..` segment is correct in either layout.
    return fileUrlToPath(new URL('..', import.meta.url).href);
  } catch {
    return null;
  }
})();

function stripTrailingSlash(directory: string): string {
  return directory.length > 1 && /[\\/]$/.test(directory) ? directory.slice(0, -1) : directory;
}

/**
 * Build the ordered candidate paths for a helper library.
 *
 * @param buildDirectory Subdirectory of `build/`, for example `dbus-native`.
 * @param names Shared library file names for the current platform.
 * @param environmentVariable Override that takes precedence, for example
 *   `GEA_FFI_DBUS_LIBRARY`.
 * @param environment The environment record to read (usually `process.env`).
 */
export function helperLibraryCandidates(
  buildDirectory: string,
  names: readonly string[],
  environmentVariable: string,
  environment: Record<string, string | undefined>
): string[] {
  const candidates: string[] = [];
  const configured = environment[environmentVariable];
  if (configured) candidates.push(configured);
  if (packageRoot) {
    const base = `${stripTrailingSlash(packageRoot)}/build/${buildDirectory}`;
    for (const name of names) candidates.push(`${base}/${name}`);
  }
  return candidates;
}

/** True when the package root could be resolved. Exposed for diagnostics and tests. */
export function helperLibraryBaseAvailable(): boolean {
  return packageRoot !== null;
}
