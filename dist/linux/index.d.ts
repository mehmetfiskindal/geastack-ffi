/**
 * @geastack/ffi - Linux (POSIX, Sysfs/Procfs, ioctl & D-Bus) Bridge
 * High-performance interop with Linux shared libraries (.so), POSIX errno/ioctl,
 * kernel virtual filesystems (/sys, /proc), and Desktop/System D-Bus services.
 */
import { Pointer } from '../memory.js';
import { DynamicLibrary, LibraryFunctions } from '../library.js';
import { type DBusSignal, type DBusTypedValue } from './dbus-native.js';
/**
 * Standard POSIX Error Codes (errno.h).
 */
export declare const ERRNO: {
    readonly EOK: 0;
    readonly EPERM: 1;
    readonly ENOENT: 2;
    readonly ESRCH: 3;
    readonly EINTR: 4;
    readonly EIO: 5;
    readonly ENXIO: 6;
    readonly EBADF: 9;
    readonly Ebadf: 9;
    readonly EAGAIN: 11;
    readonly ENOMEM: 12;
    readonly EACCES: 13;
    readonly EFAULT: 14;
    readonly EBUSY: 16;
    readonly EEXIST: 17;
    readonly ENODEV: 19;
    readonly ENOTDIR: 20;
    readonly EISDIR: 21;
    readonly EINVAL: 22;
    readonly ENOTTY: 25;
    readonly ENOSPC: 28;
    readonly ENOSYS: 38;
    readonly EPIPE: 32;
    readonly ETIMEDOUT: 110;
};
/**
 * Linux / POSIX System Helpers (errno, strerror, ioctl, shared object loader).
 */
export declare class POSIX {
    /**
     * Get the current thread's POSIX errno value.
     */
    static getErrno(): number;
    /**
     * Set the current thread's POSIX errno value.
     */
    static setErrno(code: number): void;
    /**
     * Return human-readable description for a POSIX errno code (strerror).
     */
    static strerror(code?: number): string;
    /**
     * Open a Linux shared library (e.g. 'c', 'm', 'udev', 'dbus-1', 'asound') with automatic 'lib*.so' resolution.
     */
    static openSystemLibrary(libName: string, functions: LibraryFunctions): DynamicLibrary;
    /**
     * Perform a POSIX ioctl system call on a device file descriptor (e.g. /dev/i2c-1, /dev/spidev0.0, /dev/gpiochip0).
     */
    static ioctl(fd: number, request: number, arg?: Pointer | number): number;
    /**
     * Register a handler for a specific ioctl request code (for dev/test simulation).
     */
    static registerIoctlHandler(request: number, handler: (fd: number, request: number, arg?: Pointer | number) => number): void;
}
/**
 * Linux Kernel Virtual Filesystem (/sys/class/*, /proc/*) Interop Helper.
 * Ideal for querying battery status (/sys/class/power_supply), thermal zones, GPIO, and hardware attributes.
 */
export declare class Sysfs {
    /**
     * Read a trimmed string value from a /sys or /proc virtual file.
     */
    static read(path: string): string | null;
    /**
     * Read and parse an integer value from a /sys or /proc virtual file.
     */
    static readInt(path: string, radix?: number): number | null;
    /**
     * Write a string value to a /sys or /proc virtual file.
     */
    static write(path: string, value: string | number): boolean;
    /**
     * Register a simulated /sys or /proc file entry for cross-platform testing.
     */
    static registerMockFile(path: string, content: string | number): void;
}
export type DBusBusType = 'session' | 'system';
export type { DBusSignal, DBusTypedValue } from './dbus-native.js';
/**
 * Represents a proxy to a remote D-Bus object and interface.
 */
export declare class DBusProxy {
    readonly bus: DBusBusType;
    readonly service: string;
    readonly objectPath: string;
    readonly interfaceName: string;
    constructor(bus: DBusBusType, service: string, objectPath: string, interfaceName: string);
    /**
     * Call a D-Bus method on this interface.
     */
    callMethod<T = any>(methodName: string, ...args: any[]): T;
    /**
     * Read a property via org.freedesktop.DBus.Properties.Get.
     */
    getProperty<T = any>(propertyName: string): T;
    /**
     * Write a property via org.freedesktop.DBus.Properties.Set.
     */
    setProperty(propertyName: string, value: any): void;
    /** Read all properties via org.freedesktop.DBus.Properties.GetAll. */
    getAllProperties(): Record<string, any>;
    /**
     * Subscribe to a D-Bus signal emitted by this interface.
     */
    onSignal(signalName: string, listener: (...args: any[]) => void): () => void;
}
/**
 * Linux D-Bus Inter-Process Communication Bridge (sd-bus / libdbus-1).
 * Provides access to UPower, BlueZ, NetworkManager, systemd, and Freedesktop Desktop portals.
 */
export declare class DBus {
    /**
     * Create a proxy for a remote D-Bus service object and interface.
     */
    static getProxy(bus: DBusBusType, service: string, objectPath: string, interfaceName: string): DBusProxy;
    /**
     * Register a D-Bus method handler (for testing or service exporting).
     */
    static registerMethodHandler(service: string, objectPath: string, interfaceName: string, methodName: string, handler: (...args: any[]) => any): void;
    /**
     * Register or update a D-Bus property value.
     */
    static registerProperty(service: string, objectPath: string, interfaceName: string, propertyName: string, value: any): void;
    /**
     * Emit a D-Bus signal to all subscribed listeners.
     */
    static emitSignal(service: string, objectPath: string, interfaceName: string, signalName: string, ...args: any[]): void;
    /**
     * True when the native libdbus bridge is loaded (Linux/macOS with
     * `build:dbus-host` output, or GEA_FFI_DBUS_LIBRARY set).
     */
    static get nativeAvailable(): boolean;
    /** Close all native D-Bus connections opened by this module. */
    static close(): void;
    /** Add a match rule so incoming signals are queued for nextSignal(). */
    static addMatch(rule: string, bus?: DBusBusType): void;
    /** Remove a previously installed signal match rule. */
    static removeMatch(rule: string, bus?: DBusBusType): void;
    /**
     * Wait for the next matching signal. Returns null on timeout.
     * A host event loop should call this from a timer or a worker thread.
     */
    static nextSignal(bus?: DBusBusType, timeoutMs?: number): DBusSignal | null;
    /**
     * Call a method shaped `(s, a(sv)) -> u`, used by NGFD Play.
     * Properties accept strings, booleans, numbers, or DBus typed values.
     */
    static callWithProperties(service: string, objectPath: string, interfaceName: string, method: string, firstArgument: string, properties?: Record<string, unknown>, bus?: DBusBusType): number;
    /** Mark a string argument as a D-Bus object path (`o`). */
    static objectPath(value: string): DBusTypedValue;
    static bool(value: boolean): DBusTypedValue;
    static int32(value: number): DBusTypedValue;
    static uint32(value: number): DBusTypedValue;
    static int64(value: bigint): DBusTypedValue;
    static uint64(value: bigint): DBusTypedValue;
    static double(value: number): DBusTypedValue;
    /** String array argument (`as`). */
    static stringArray(values: readonly string[]): DBusTypedValue;
    /** Byte array argument (`ay`). */
    static byteArray(values: Uint8Array): DBusTypedValue;
    /** Dictionary argument (`a{sv}`). */
    static dictionary(values: Record<string, unknown>): DBusTypedValue;
    /** Object-path array argument (`ao`). */
    static objectPathArray(values: readonly string[]): DBusTypedValue;
    /** String dictionary argument (`a{ss}`). */
    static stringDictionary(values: Record<string, string>): DBusTypedValue;
    /** int32 array argument (`ai`). */
    static int32Array(values: readonly number[]): DBusTypedValue;
    /** uint32 array argument (`au`). */
    static uint32Array(values: readonly number[]): DBusTypedValue;
    /** Empty D-Bus array argument; pass the element signature, e.g. `(sv)`. */
    static emptyArray(elementSignature: string): DBusTypedValue;
    static invokeMethod(proxy: DBusProxy, methodName: string, ...args: any[]): any;
    static readProperty(proxy: DBusProxy, propertyName: string): any;
    static getAllProperties(proxy: DBusProxy): Record<string, any>;
    static writeProperty(proxy: DBusProxy, propertyName: string, value: any): void;
    /** Forward a polled native signal to matching onSignal listeners. */
    static dispatchSignal(signal: {
        path: string;
        interfaceName: string;
        member: string;
        args: unknown[];
    }, bus: DBusBusType): void;
    static addSignalListener(proxy: DBusProxy, signalName: string, listener: (...args: any[]) => void): () => void;
}
//# sourceMappingURL=index.d.ts.map