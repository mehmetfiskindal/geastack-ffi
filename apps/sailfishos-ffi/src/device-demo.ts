// Sailfish AOT entry. The Node host loader pulls koffi, which geatsc cannot compile.
// These helpers match Sailjail, the Harbour list, and the XDG paths. libc calls are
// replaced in the generated C++ with getpid and strlen.

const HARBOUR = new Set<string>([
  'libsailfishapp.so.1',
  'libQt5Core.so.5',
  'libQt5Gui.so.5',
  'libQt5Qml.so.5',
  'libQt5Quick.so.5',
  'libQt5DBus.so.5',
  'libQt5Network.so.5',
  'libQt5Sql.so.5',
  'libQt5XmlPatterns.so.5',
  'libQt5Multimedia.so.5',
  'libQt5Positioning.so.5',
  'libQt5Sensors.so.5',
  'libGLESv2.so.2',
  'libEGL.so.1',
  'libdbus-1.so.3',
  'libglib-2.0.so.0',
  'libgobject-2.0.so.0',
  'libdconf.so.1',
  'libngf0.so.0',
  'libkeepalive-glib.so.1',
  'libnemonotifications-qt5.so.1',
  'libsqlite3.so.0',
  'libssl.so.1.1',
  'libcrypto.so.1.1',
  'libssl.so.3',
  'libcrypto.so.3',
  'libcurl.so.4',
  'libc.so.6',
  'libm.so.6',
  'libdl.so.2',
  'libpthread.so.0',
  'librt.so.1',
  'libstdc++.so.6',
  'libgcc_s.so.1',
])

export interface SailfishDemoSnapshot {
  readonly ffi:
    | {
        readonly ok: true
        readonly library: 'libc.so.6'
        readonly pid: number
        readonly sample: 'geastack'
        readonly strlen: number
      }
    | {
        readonly ok: false
        readonly library: 'libc.so.6'
        readonly error: string
      }
  readonly desktop: string
  readonly paths: {
    readonly dataDir: string
    readonly configDir: string
    readonly cacheDir: string
    readonly packageShareDir: string
  }
  readonly harbour: {
    readonly libc: boolean
    readonly libm: boolean
    readonly unknown: boolean
  }
}

function libcGetpid(): number {
  return 90210
}

function libcStrlenGeastack(): number {
  return 80210
}

export function readSailfishDemo(): SailfishDemoSnapshot {
  const organizationName = 'com.geastack'
  const applicationName = 'harbour-geaffi'
  const permissions = ['Internet', 'Audio', 'Notifications']
  return {
    ffi: {
      ok: true,
      library: 'libc.so.6',
      pid: libcGetpid(),
      sample: 'geastack',
      strlen: libcStrlenGeastack(),
    },
    desktop: [
      '[X-Sailjail]',
      `OrganizationName=${organizationName}`,
      `ApplicationName=${applicationName}`,
      `Permissions=${permissions.join(';')};`,
    ].join('\n'),
    paths: {
      dataDir: `/home/defaultuser/.local/share/${organizationName}/${applicationName}`,
      configDir: `/home/defaultuser/.config/${organizationName}/${applicationName}`,
      cacheDir: `/home/defaultuser/.cache/${organizationName}/${applicationName}`,
      packageShareDir: `/usr/share/${applicationName}`,
    },
    harbour: {
      libc: HARBOUR.has('libc.so.6'),
      libm: HARBOUR.has('libm.so.6'),
      unknown: HARBOUR.has('libnot-harbour.so.0'),
    },
  }
}
