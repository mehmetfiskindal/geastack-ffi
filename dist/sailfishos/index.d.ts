/**
 * @geastack/ffi - SailfishOS (Jolla / Mer / NemoMobile) Bridge
 * High-performance native interop for SailfishOS Linux Mobile devices:
 * - MCE (Mode Control Entity: display state, keepalive/blanking, battery, lock state)
 * - NGFD (Non-Graphical Feedback Daemon: pulley menu haptics, vibra, sound, LEDs)
 * - DConf (Silica theme/ambiance & system configuration keys)
 * - Sailjail (Sandboxing permissions & Jolla Harbour RPM compliance validator)
 */
import { DynamicLibrary, LibraryFunctions } from '../library.js';
/**
 * Standard Sailjail Sandbox Permissions defined by SailfishOS.
 */
export type SailjailPermission = 'Audio' | 'Bluetooth' | 'Camera' | 'Contacts' | 'Calendar' | 'Internet' | 'KeepAlive' | 'Location' | 'MediaIndexing' | 'Microphone' | 'Notifications' | 'Phone' | 'RemovableMedia' | 'Sensors' | 'Sharing' | 'UserDirs' | 'WebView';
export interface SailjailConfig {
    readonly organizationName: string;
    readonly applicationName: string;
    readonly permissions: readonly SailjailPermission[];
}
/**
 * Shared libraries officially whitelisted by Jolla Harbour for SailfishOS RPM packages.
 */
export declare const HARBOUR_ALLOWED_LIBRARIES: ReadonlySet<string>;
/**
 * SailfishOS Sailjail Sandbox & Jolla Harbour Packaging Helper.
 */
export declare class Sailjail {
    /**
     * Generate the `[X-Sailjail]` block for a SailfishOS `.desktop` file.
     */
    static generateDesktopSection(config: SailjailConfig): string;
    /**
     * Check whether a shared library (.so) is permitted in Jolla Harbour without bundling inside `/usr/share/<app>/lib`.
     */
    static isHarbourAllowedLibrary(soName: string): boolean;
}
export type MceDisplayStatus = 'on' | 'dimmed' | 'off';
export type MceChargerState = 'on' | 'off';
/**
 * SailfishOS Mode Control Entity (`com.nokia.mce`) Hardware & Power Bridge.
 * Manages screen state, display blanking prevention (keepalive), battery level, and charger state.
 */
export declare class MCE {
    /**
     * Query current display status ('on', 'dimmed', 'off') via MCE D-Bus.
     */
    static getDisplayStatus(): MceDisplayStatus;
    /**
     * Query current battery percentage (0-100) via MCE D-Bus.
     */
    static getBatteryLevel(): number;
    /**
     * Query current charger state ('on' | 'off') via MCE D-Bus.
     */
    static getChargerState(): MceChargerState;
    /**
     * Prevent or allow screen blanking (keep screen awake during video playback/navigation).
     */
    static setPreventBlanking(prevent: boolean): boolean;
    /**
     * Returns true if display blanking pause (keepalive) is currently active.
     */
    static isBlankingPrevented(): boolean;
    /**
     * Subscribe to display state transitions (`display_status_ind`).
     */
    static onDisplayStatusChanged(listener: (status: MceDisplayStatus) => void): () => void;
    /**
     * Subscribe to battery percentage updates (`battery_level_ind`).
     */
    static onBatteryLevelChanged(listener: (level: number) => void): () => void;
    /**
     * Simulate an MCE state update and emit the corresponding system D-Bus signal (for dev/tests).
     */
    static simulateStateChange(state: {
        displayStatus?: MceDisplayStatus;
        batteryLevel?: number;
        chargerState?: MceChargerState;
    }): void;
}
/**
 * Standard SailfishOS Non-Graphical Feedback (Haptics/Sound/LED) Event Names.
 */
export type NgfdEventName = 'pulley_highlight' | 'pulley_activate' | 'touch' | 'touch_weak' | 'keypad' | 'chat' | 'email' | 'sms' | 'ringtone' | 'alarm' | 'battery_low' | (string & {});
/**
 * SailfishOS Non-Graphical Feedback Daemon (`libngf0` / `com.nokia.NonGraphicFeedback1.Backend`) Bridge.
 * Triggers native Silica pulley menu haptics, tactile feedback, LEDs, and system tones.
 */
export declare class NGFD {
    /**
     * Play a feedback event (e.g. `'pulley_highlight'`, `'touch'`, `'chat'`) and return its event ID.
     */
    static play(eventName: NgfdEventName, properties?: Record<string, any>): number;
    /**
     * Stop an active feedback event by ID.
     */
    static stop(eventId: number): boolean;
    /**
     * Check if a given feedback event ID is currently active.
     */
    static isPlaying(eventId: number): boolean;
}
/**
 * SailfishOS DConf (`libdconf`) Configuration & Silica Ambiance Bridge.
 */
export declare class DConf {
    /**
     * Read a DConf key (e.g. `/desktop/jolla/theme/color/highlight`).
     */
    static read<T = any>(key: string, defaultValue?: T): T | null;
    /**
     * Write a DConf key and notify any matching prefix watchers.
     */
    static write(key: string, value: any): void;
    /**
     * Watch a DConf key or directory prefix (e.g. `/desktop/jolla/theme/`).
     */
    static watch(keyPrefix: string, listener: (key: string, value: any) => void): () => void;
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
export declare class SailfishSystem {
    /**
     * Compute standard Sailjail-compliant XDG and `/usr/share/<app>` paths for a SailfishOS application.
     */
    static getAppPaths(organizationName: string, applicationName: string, homeDir?: string): SailfishAppPaths;
    /**
     * Open a SailfishOS shared library (`libsailfishapp.so.1`, `libngf0.so.0`, `libdconf.so.1`, etc.).
     */
    static openSystemLibrary<T extends LibraryFunctions>(libName: string, functions: T): DynamicLibrary<T>;
}
//# sourceMappingURL=index.d.ts.map