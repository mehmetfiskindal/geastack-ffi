// SPDX-License-Identifier: Apache-2.0
/**
 * @geastack/ffi - SailfishOS (Jolla / Mer / NemoMobile) Bridge
 * High-performance native interop for SailfishOS Linux Mobile devices:
 * - MCE (Mode Control Entity: display state, keepalive/blanking, battery, lock state)
 * - NGFD (Non-Graphical Feedback Daemon: pulley menu haptics, vibra, sound, LEDs)
 * - DConf (Silica theme/ambiance & system configuration keys)
 * - Sailjail (Sandboxing permissions & Jolla Harbour RPM compliance validator)
 */

import { Library, DynamicLibrary, LibraryFunctions, resolvePlatformLibraryName } from '../library.js';
import { DBus } from '../linux/index.js';

/**
 * Standard Sailjail Sandbox Permissions defined by SailfishOS.
 */
export type SailjailPermission =
  | 'Audio'
  | 'Bluetooth'
  | 'Camera'
  | 'Contacts'
  | 'Calendar'
  | 'Internet'
  | 'KeepAlive'
  | 'Location'
  | 'MediaIndexing'
  | 'Microphone'
  | 'Notifications'
  | 'Phone'
  | 'RemovableMedia'
  | 'Sensors'
  | 'Sharing'
  | 'UserDirs'
  | 'WebView';

export interface SailjailConfig {
  readonly organizationName: string;
  readonly applicationName: string;
  readonly permissions: readonly SailjailPermission[];
}

/**
 * Shared libraries officially whitelisted by Jolla Harbour for SailfishOS RPM packages.
 */
export const HARBOUR_ALLOWED_LIBRARIES: ReadonlySet<string> = new Set([
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
]);

/**
 * SailfishOS Sailjail Sandbox & Jolla Harbour Packaging Helper.
 */
export class Sailjail {
  /**
   * Generate the `[X-Sailjail]` block for a SailfishOS `.desktop` file.
   */
  static generateDesktopSection(config: SailjailConfig): string {
    const perms = config.permissions.join(';');
    return [
      '[X-Sailjail]',
      `OrganizationName=${config.organizationName}`,
      `ApplicationName=${config.applicationName}`,
      `Permissions=${perms}${perms.length > 0 ? ';' : ''}`,
    ].join('\n');
  }

  /**
   * Check whether a shared library (.so) is permitted in Jolla Harbour without bundling inside `/usr/share/<app>/lib`.
   */
  static isHarbourAllowedLibrary(soName: string): boolean {
    return HARBOUR_ALLOWED_LIBRARIES.has(soName);
  }
}

export type MceDisplayStatus = 'on' | 'dimmed' | 'off';
export type MceChargerState = 'on' | 'off';

const MCE_SERVICE = 'com.nokia.mce';
const MCE_REQUEST_PATH = '/com/nokia/mce/request';
const MCE_REQUEST_IFACE = 'com.nokia.mce.request';
const MCE_SIGNAL_PATH = '/com/nokia/mce/signal';
const MCE_SIGNAL_IFACE = 'com.nokia.mce.signal';

let mceDefaultsInitialized = false;

function ensureMceDefaults(): void {
  if (mceDefaultsInitialized) return;
  mceDefaultsInitialized = true;

  DBus.registerProperty(MCE_SERVICE, MCE_REQUEST_PATH, MCE_REQUEST_IFACE, 'display_status', 'on');
  DBus.registerProperty(MCE_SERVICE, MCE_REQUEST_PATH, MCE_REQUEST_IFACE, 'battery_level', 85);
  DBus.registerProperty(MCE_SERVICE, MCE_REQUEST_PATH, MCE_REQUEST_IFACE, 'charger_state', 'off');
  DBus.registerProperty(MCE_SERVICE, MCE_REQUEST_PATH, MCE_REQUEST_IFACE, 'blanking_paused', false);

  DBus.registerMethodHandler(MCE_SERVICE, MCE_REQUEST_PATH, MCE_REQUEST_IFACE, 'get_display_status', () => {
    const proxy = DBus.getProxy('system', MCE_SERVICE, MCE_REQUEST_PATH, MCE_REQUEST_IFACE);
    return proxy.getProperty<MceDisplayStatus>('display_status') ?? 'on';
  });

  DBus.registerMethodHandler(MCE_SERVICE, MCE_REQUEST_PATH, MCE_REQUEST_IFACE, 'get_battery_level', () => {
    const proxy = DBus.getProxy('system', MCE_SERVICE, MCE_REQUEST_PATH, MCE_REQUEST_IFACE);
    return proxy.getProperty<number>('battery_level') ?? 100;
  });

  DBus.registerMethodHandler(MCE_SERVICE, MCE_REQUEST_PATH, MCE_REQUEST_IFACE, 'get_charger_state', () => {
    const proxy = DBus.getProxy('system', MCE_SERVICE, MCE_REQUEST_PATH, MCE_REQUEST_IFACE);
    return proxy.getProperty<MceChargerState>('charger_state') ?? 'off';
  });

  DBus.registerMethodHandler(MCE_SERVICE, MCE_REQUEST_PATH, MCE_REQUEST_IFACE, 'req_display_blanking_pause', () => {
    const proxy = DBus.getProxy('system', MCE_SERVICE, MCE_REQUEST_PATH, MCE_REQUEST_IFACE);
    proxy.setProperty('blanking_paused', true);
    return true;
  });

  DBus.registerMethodHandler(
    MCE_SERVICE,
    MCE_REQUEST_PATH,
    MCE_REQUEST_IFACE,
    'req_display_cancel_blanking_pause',
    () => {
      const proxy = DBus.getProxy('system', MCE_SERVICE, MCE_REQUEST_PATH, MCE_REQUEST_IFACE);
      proxy.setProperty('blanking_paused', false);
      return true;
    }
  );
}

/**
 * SailfishOS Mode Control Entity (`com.nokia.mce`) Hardware & Power Bridge.
 * Manages screen state, display blanking prevention (keepalive), battery level, and charger state.
 */
export class MCE {
  /**
   * Query current display status ('on', 'dimmed', 'off') via MCE D-Bus.
   */
  static getDisplayStatus(): MceDisplayStatus {
    ensureMceDefaults();
    const reqProxy = DBus.getProxy('system', MCE_SERVICE, MCE_REQUEST_PATH, MCE_REQUEST_IFACE);
    return reqProxy.callMethod<MceDisplayStatus>('get_display_status');
  }

  /**
   * Query current battery percentage (0-100) via MCE D-Bus.
   */
  static getBatteryLevel(): number {
    ensureMceDefaults();
    const reqProxy = DBus.getProxy('system', MCE_SERVICE, MCE_REQUEST_PATH, MCE_REQUEST_IFACE);
    return reqProxy.callMethod<number>('get_battery_level');
  }

  /**
   * Query current charger state ('on' | 'off') via MCE D-Bus.
   */
  static getChargerState(): MceChargerState {
    ensureMceDefaults();
    const reqProxy = DBus.getProxy('system', MCE_SERVICE, MCE_REQUEST_PATH, MCE_REQUEST_IFACE);
    return reqProxy.callMethod<MceChargerState>('get_charger_state');
  }

  /**
   * Prevent or allow screen blanking (keep screen awake during video playback/navigation).
   */
  static setPreventBlanking(prevent: boolean): boolean {
    ensureMceDefaults();
    const reqProxy = DBus.getProxy('system', MCE_SERVICE, MCE_REQUEST_PATH, MCE_REQUEST_IFACE);
    if (prevent) {
      return reqProxy.callMethod<boolean>('req_display_blanking_pause');
    }
    return reqProxy.callMethod<boolean>('req_display_cancel_blanking_pause');
  }

  /**
   * Returns true if display blanking pause (keepalive) is currently active.
   */
  static isBlankingPrevented(): boolean {
    ensureMceDefaults();
    const reqProxy = DBus.getProxy('system', MCE_SERVICE, MCE_REQUEST_PATH, MCE_REQUEST_IFACE);
    return Boolean(reqProxy.getProperty('blanking_paused'));
  }

  /**
   * Subscribe to display state transitions (`display_status_ind`).
   */
  static onDisplayStatusChanged(listener: (status: MceDisplayStatus) => void): () => void {
    ensureMceDefaults();
    const sigProxy = DBus.getProxy('system', MCE_SERVICE, MCE_SIGNAL_PATH, MCE_SIGNAL_IFACE);
    return sigProxy.onSignal('display_status_ind', listener);
  }

  /**
   * Subscribe to battery percentage updates (`battery_level_ind`).
   */
  static onBatteryLevelChanged(listener: (level: number) => void): () => void {
    ensureMceDefaults();
    const sigProxy = DBus.getProxy('system', MCE_SERVICE, MCE_SIGNAL_PATH, MCE_SIGNAL_IFACE);
    return sigProxy.onSignal('battery_level_ind', listener);
  }

  /**
   * Simulate an MCE state update and emit the corresponding system D-Bus signal (for dev/tests).
   */
  static simulateStateChange(state: {
    displayStatus?: MceDisplayStatus;
    batteryLevel?: number;
    chargerState?: MceChargerState;
  }): void {
    ensureMceDefaults();
    const reqProxy = DBus.getProxy('system', MCE_SERVICE, MCE_REQUEST_PATH, MCE_REQUEST_IFACE);
    if (state.displayStatus !== undefined) {
      reqProxy.setProperty('display_status', state.displayStatus);
      DBus.emitSignal(MCE_SERVICE, MCE_SIGNAL_PATH, MCE_SIGNAL_IFACE, 'display_status_ind', state.displayStatus);
    }
    if (state.batteryLevel !== undefined) {
      reqProxy.setProperty('battery_level', state.batteryLevel);
      DBus.emitSignal(MCE_SERVICE, MCE_SIGNAL_PATH, MCE_SIGNAL_IFACE, 'battery_level_ind', state.batteryLevel);
    }
    if (state.chargerState !== undefined) {
      reqProxy.setProperty('charger_state', state.chargerState);
      DBus.emitSignal(MCE_SERVICE, MCE_SIGNAL_PATH, MCE_SIGNAL_IFACE, 'charger_state_ind', state.chargerState);
    }
  }
}

/**
 * Standard SailfishOS Non-Graphical Feedback (Haptics/Sound/LED) Event Names.
 */
export type NgfdEventName =
  | 'pulley_highlight'
  | 'pulley_activate'
  | 'touch'
  | 'touch_weak'
  | 'keypad'
  | 'chat'
  | 'email'
  | 'sms'
  | 'ringtone'
  | 'alarm'
  | 'battery_low'
  | (string & {});

let nextNgfdEventId = 1;
const activeNgfdEvents = new Map<number, { eventName: string; properties: Record<string, any> }>();

/**
 * SailfishOS Non-Graphical Feedback Daemon (`libngf0` / `com.nokia.NonGraphicFeedback1.Backend`) Bridge.
 * Triggers native Silica pulley menu haptics, tactile feedback, LEDs, and system tones.
 */
export class NGFD {
  /**
   * Play a feedback event (e.g. `'pulley_highlight'`, `'touch'`, `'chat'`) and return its event ID.
   */
  static play(eventName: NgfdEventName, properties: Record<string, any> = {}): number {
    const eventId = nextNgfdEventId++;
    activeNgfdEvents.set(eventId, { eventName, properties });
    return eventId;
  }

  /**
   * Stop an active feedback event by ID.
   */
  static stop(eventId: number): boolean {
    return activeNgfdEvents.delete(eventId);
  }

  /**
   * Check if a given feedback event ID is currently active.
   */
  static isPlaying(eventId: number): boolean {
    return activeNgfdEvents.has(eventId);
  }
}

const dconfStore = new Map<string, any>([
  ['/desktop/jolla/theme/color/highlight', '#00b4ff'],
  ['/desktop/jolla/theme/color/primary', '#ffffff'],
  ['/desktop/jolla/theme/color/secondary', '#b0b0b0'],
  ['/desktop/sailfish/silica/theme_pixel_ratio', 1.75],
]);
const dconfWatchers = new Map<string, Set<(key: string, value: any) => void>>();

/**
 * SailfishOS DConf (`libdconf`) Configuration & Silica Ambiance Bridge.
 */
export class DConf {
  /**
   * Read a DConf key (e.g. `/desktop/jolla/theme/color/highlight`).
   */
  static read<T = any>(key: string, defaultValue?: T): T | null {
    if (dconfStore.has(key)) {
      return dconfStore.get(key) as T;
    }
    return defaultValue !== undefined ? defaultValue : null;
  }

  /**
   * Write a DConf key and notify any matching prefix watchers.
   */
  static write(key: string, value: any): void {
    dconfStore.set(key, value);
    for (const [prefix, listeners] of dconfWatchers.entries()) {
      if (key.startsWith(prefix)) {
        for (const fn of listeners) {
          fn(key, value);
        }
      }
    }
  }

  /**
   * Watch a DConf key or directory prefix (e.g. `/desktop/jolla/theme/`).
   */
  static watch(keyPrefix: string, listener: (key: string, value: any) => void): () => void {
    let set = dconfWatchers.get(keyPrefix);
    if (!set) {
      set = new Set();
      dconfWatchers.set(keyPrefix, set);
    }
    set.add(listener);
    return () => {
      set?.delete(listener);
    };
  }
}

export interface SailfishAppPaths {
  readonly dataDir: string;
  readonly configDir: string;
  readonly cacheDir: string;
  readonly packageShareDir: string;
  readonly bundledLibDir: string;
}

/**
 * SailfishOS Application Runtime & System Library Loader (`libsailfishapp.so.1`).
 */
export class SailfishSystem {
  /**
   * Compute standard Sailjail-compliant XDG and `/usr/share/<app>` paths for a SailfishOS application.
   */
  static getAppPaths(organizationName: string, applicationName: string, homeDir = '/home/defaultuser'): SailfishAppPaths {
    return {
      dataDir: `${homeDir}/.local/share/${organizationName}/${applicationName}`,
      configDir: `${homeDir}/.config/${organizationName}/${applicationName}`,
      cacheDir: `${homeDir}/.cache/${organizationName}/${applicationName}`,
      packageShareDir: `/usr/share/${applicationName}`,
      bundledLibDir: `/usr/share/${applicationName}/lib`,
    };
  }

  /**
   * Open a SailfishOS shared library (`libsailfishapp.so.1`, `libngf0.so.0`, `libdconf.so.1`, etc.).
   */
  static openSystemLibrary<T extends LibraryFunctions>(libName: string, functions: T): DynamicLibrary<T> {
    const resolved = resolvePlatformLibraryName(libName, 'sailfishos');
    return Library.open(resolved, functions);
  }
}
