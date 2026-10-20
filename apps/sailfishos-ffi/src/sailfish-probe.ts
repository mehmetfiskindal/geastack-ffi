// SPDX-License-Identifier: Apache-2.0
import { Library, Sailjail, SailfishSystem } from '@geastack/ffi';

export const SAILFISH_APP = {
  organizationName: 'com.geastack',
  applicationName: 'harbour-geaffi',
  permissions: ['Internet', 'Audio', 'Notifications'] as const,
};

export interface SailfishFfiSuccess {
  readonly ok: true;
  readonly library: 'libc.so.6';
  readonly pid: number;
  readonly sample: 'geastack';
  readonly strlen: number;
}

export interface SailfishFfiFailure {
  readonly ok: false;
  readonly library: 'libc.so.6';
  readonly error: string;
}

export interface SailfishDemoSnapshot {
  readonly ffi: SailfishFfiSuccess | SailfishFfiFailure;
  readonly desktop: string;
  readonly paths: {
    readonly dataDir: string;
    readonly configDir: string;
    readonly cacheDir: string;
    readonly packageShareDir: string;
  };
  readonly harbour: {
    readonly libc: boolean;
    readonly libm: boolean;
    readonly unknown: boolean;
  };
}

function readLibc(): SailfishDemoSnapshot['ffi'] {
  try {
    const libc = Library.open('libc.so.6', {
      getpid: { args: [], returns: 'int32' },
      strlen: { args: ['string'], returns: 'uint64' },
    }, { backend: 'native' });
    try {
      const pid = libc.symbols.getpid() as number;
      const length = libc.symbols.strlen('geastack') as bigint;
      return {
        ok: true,
        library: 'libc.so.6',
        pid,
        sample: 'geastack',
        strlen: Number(length),
      };
    } finally {
      libc.close();
    }
  } catch (error) {
    return {
      ok: false,
      library: 'libc.so.6',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function readSailfishDemo(): SailfishDemoSnapshot {
  const paths = SailfishSystem.getAppPaths(
    SAILFISH_APP.organizationName,
    SAILFISH_APP.applicationName,
  );
  return {
    ffi: readLibc(),
    desktop: Sailjail.generateDesktopSection({
      organizationName: SAILFISH_APP.organizationName,
      applicationName: SAILFISH_APP.applicationName,
      permissions: SAILFISH_APP.permissions,
    }),
    paths: {
      dataDir: paths.dataDir,
      configDir: paths.configDir,
      cacheDir: paths.cacheDir,
      packageShareDir: paths.packageShareDir,
    },
    harbour: {
      libc: Sailjail.isHarbourAllowedLibrary('libc.so.6'),
      libm: Sailjail.isHarbourAllowedLibrary('libm.so.6'),
      unknown: Sailjail.isHarbourAllowedLibrary('libnot-harbour.so.0'),
    },
  };
}
