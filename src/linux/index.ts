// SPDX-License-Identifier: Apache-2.0
/**
 * @geastack/ffi - Linux (POSIX, Sysfs/Procfs, ioctl & D-Bus) Bridge
 * High-performance interop with Linux shared libraries (.so), POSIX errno/ioctl,
 * kernel virtual filesystems (/sys, /proc), and Desktop/System D-Bus services.
 */

import { Pointer } from '../memory.js';
import { Library, DynamicLibrary, LibraryFunctions, resolvePlatformLibraryName, detectHostPlatform } from '../library.js';
import { readNativeInt32 } from '../host-backend.js';
import { adoptNativePointer, requireNativeAddress } from '../native-pointers.js';
import {
  nativeDBus,
  dbusBool,
  dbusDouble,
  dbusEmptyArray,
  dbusInt32,
  dbusStringArray,
  dbusByteArray,
  dbusDictionary,
  dbusInt64,
  dbusObjectPath,
  dbusUint32,
  dbusUint64,
  type DBusSignal,
  type DBusTypedValue,
} from './dbus-native.js';

/**
 * Standard POSIX Error Codes (errno.h).
 */
export const ERRNO = {
  EOK: 0,
  EPERM: 1,
  ENOENT: 2,
  ESRCH: 3,
  EINTR: 4,
  EIO: 5,
  ENXIO: 6,
  EBADF: 9,
  Ebadf: 9,
  EAGAIN: 11,
  ENOMEM: 12,
  EACCES: 13,
  EFAULT: 14,
  EBUSY: 16,
  EEXIST: 17,
  ENODEV: 19,
  ENOTDIR: 20,
  EISDIR: 21,
  EINVAL: 22,
  ENOTTY: 25,
  ENOSPC: 28,
  ENOSYS: 38,
  EPIPE: 32,
  ETIMEDOUT: 110,
} as const;

const ERRNO_MESSAGES: Record<number, string> = {
  0: 'Success',
  1: 'Operation not permitted',
  2: 'No such file or directory',
  3: 'No such process',
  4: 'Interrupted system call',
  5: 'Input/output error',
  6: 'No such device or address',
  9: 'Bad file descriptor',
  11: 'Resource temporarily unavailable',
  12: 'Cannot allocate memory',
  13: 'Permission denied',
  14: 'Bad address',
  16: 'Device or resource busy',
  17: 'File exists',
  19: 'No such device',
  20: 'Not a directory',
  21: 'Is a directory',
  22: 'Invalid argument',
  25: 'Inappropriate ioctl for device',
  28: 'No space left on device',
  38: 'Function not implemented',
  32: 'Broken pipe',
  110: 'Connection timed out',
};

let currentErrno = 0;
const ioctlHandlers = new Map<number, (fd: number, request: number, arg?: Pointer | number) => number>();

interface LibcFileApi {
  readonly library: DynamicLibrary;
  readonly open: (path: string, flags: number, mode: number) => number;
  readonly close: (fd: number) => number;
  readonly read: (fd: number, buffer: Uint8Array, count: bigint) => bigint;
  readonly write: (fd: number, buffer: Uint8Array, count: bigint) => bigint;
  readonly ioctl: (fd: number, request: bigint, arg: Pointer | null) => number;
  readonly errno: () => number;
}

let libcFileApi: LibcFileApi | null | undefined;

/**
 * Load libc once for file and ioctl calls. Returns null on platforms without a
 * usable libc, where the simulated store remains the only backend.
 */
function loadLibcFileApi(): LibcFileApi | null {
  if (libcFileApi !== undefined) return libcFileApi;

  const platform = detectHostPlatform();
  const candidates = platform === 'macos'
    ? ['libSystem.B.dylib']
    : platform === 'linux' || platform === 'android'
      ? ['libc.so.6', 'libc.so']
      : [];
  const errnoSymbol = platform === 'macos' ? '__error' : '__errno_location';

  for (const path of candidates) {
    try {
      const library = Library.open(path, {
        open: { args: ['string', 'int32', 'int32'], returns: 'int32' },
        close: { args: ['int32'], returns: 'int32' },
        read: { args: ['int32', 'buffer', 'uint64'], returns: 'int64' },
        write: { args: ['int32', 'buffer', 'uint64'], returns: 'int64' },
        ioctl: { args: ['int32', 'uint64', 'pointer'], returns: 'int32' },
        errno_ptr: { symbol: errnoSymbol, args: [], returns: 'pointer' },
      }, { backend: 'native' });

      const symbols = library.symbols;
      const api: LibcFileApi = {
        library,
        open: (name, flags, mode) => Number(symbols.open(name, flags, mode)),
        close: (fd) => Number(symbols.close(fd)),
        read: (fd, buffer, count) => BigInt(symbols.read(fd, buffer, count)),
        write: (fd, buffer, count) => BigInt(symbols.write(fd, buffer, count)),
        ioctl: (fd, request, arg) => Number(symbols.ioctl(fd, request, arg)),
        errno: () => readNativeInt32(symbols.errno_ptr() as Pointer),
      };
      libcFileApi = api;
      return api;
    } catch {
      // Try the next candidate name; a platform without libc falls through to null.
    }
  }

  libcFileApi = null;
  return null;
}

const MAX_VIRTUAL_FILE_BYTES = 1024 * 1024;

function readFileWithLibc(api: LibcFileApi, path: string): string | null {
  const fd = api.open(path, 0, 0);
  if (fd < 0) {
    currentErrno = api.errno();
    return null;
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < MAX_VIRTUAL_FILE_BYTES) {
    const buffer = new Uint8Array(4096);
    const count = api.read(fd, buffer, 4096n);
    if (count < 0n) {
      currentErrno = api.errno();
      api.close(fd);
      return null;
    }
    const size = Number(count);
    if (size === 0) break;
    chunks.push(buffer.subarray(0, size));
    total += size;
  }
  api.close(fd);

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(merged).replace(/[\r\n \t]+$/, '');
}

function writeFileWithLibc(api: LibcFileApi, path: string, value: string): boolean {
  // sysfs/procfs attributes already exist; /tmp and similar paths may need creation.
  const isVirtual = path.startsWith('/sys/') || path.startsWith('/proc/');
  const flags = isVirtual ? 1 : (1 | 64 | 512); // O_WRONLY, or O_WRONLY|O_CREAT|O_TRUNC
  const fd = api.open(path, flags, 0o644);
  if (fd < 0) {
    currentErrno = api.errno();
    return false;
  }

  const data = new TextEncoder().encode(value);
  let offset = 0;
  while (offset < data.length) {
    const chunk = data.subarray(offset);
    const written = api.write(fd, chunk, BigInt(chunk.length));
    if (written <= 0n) {
      currentErrno = api.errno();
      api.close(fd);
      return false;
    }
    offset += Number(written);
  }
  api.close(fd);
  return true;
}

/**
 * Linux / POSIX System Helpers (errno, strerror, ioctl, shared object loader).
 */
export class POSIX {
  /**
   * Get the current thread's POSIX errno value.
   */
  static getErrno(): number {
    return currentErrno;
  }

  /**
   * Set the current thread's POSIX errno value.
   */
  static setErrno(code: number): void {
    currentErrno = code | 0;
  }

  /**
   * Return human-readable description for a POSIX errno code (strerror).
   */
  static strerror(code = currentErrno): string {
    return ERRNO_MESSAGES[code] || `Unknown error ${code}`;
  }

  /**
   * Open a Linux shared library (e.g. 'c', 'm', 'udev', 'dbus-1', 'asound') with automatic 'lib*.so' resolution.
   */
  static openSystemLibrary(libName: string, functions: LibraryFunctions): DynamicLibrary {
    const resolved = resolvePlatformLibraryName(libName, 'linux');
    return Library.open(resolved, functions);
  }

  /**
   * Perform a POSIX ioctl system call on a device file descriptor (e.g. /dev/i2c-1, /dev/spidev0.0, /dev/gpiochip0).
   */
  static ioctl(fd: number, request: number, arg?: Pointer | number): number {
    if (fd < 0) {
      POSIX.setErrno(ERRNO.EBADF);
      return -1;
    }
    const handler = ioctlHandlers.get(request);
    if (handler) {
      return handler(fd, request, arg);
    }

    const api = loadLibcFileApi();
    if (!api) {
      POSIX.setErrno(ERRNO.ENOSYS);
      return -1;
    }

    let nativeArg: Pointer | null = null;
    if (arg instanceof Pointer) {
      requireNativeAddress(arg, 'ioctl argument');
      nativeArg = arg;
    } else if (arg !== undefined && arg !== 0) {
      // Integer ioctl arguments are addresses in the C ABI; mark them native.
      nativeArg = adoptNativePointer(BigInt(Math.trunc(arg)));
    }

    const result = api.ioctl(fd, BigInt(Math.trunc(request)), nativeArg);
    if (result < 0) {
      POSIX.setErrno(api.errno());
    }
    return result;
  }

  /**
   * Register a handler for a specific ioctl request code (for dev/test simulation).
   */
  static registerIoctlHandler(
    request: number,
    handler: (fd: number, request: number, arg?: Pointer | number) => number
  ): void {
    ioctlHandlers.set(request, handler);
  }
}

const virtualSysfsStore = new Map<string, string>();

/**
 * Linux Kernel Virtual Filesystem (/sys/class/*, /proc/*) Interop Helper.
 * Ideal for querying battery status (/sys/class/power_supply), thermal zones, GPIO, and hardware attributes.
 */
export class Sysfs {
  /**
   * Read a trimmed string value from a /sys or /proc virtual file.
   */
  static read(path: string): string | null {
    if (virtualSysfsStore.has(path)) {
      return virtualSysfsStore.get(path)!.trim();
    }
    const api = loadLibcFileApi();
    if (!api) return null;
    return readFileWithLibc(api, path);
  }

  /**
   * Read and parse an integer value from a /sys or /proc virtual file.
   */
  static readInt(path: string, radix = 10): number | null {
    const raw = Sysfs.read(path);
    if (raw === null) return null;
    const parsed = parseInt(raw, radix);
    return Number.isNaN(parsed) ? null : parsed;
  }

  /**
   * Write a string value to a /sys or /proc virtual file.
   */
  static write(path: string, value: string | number): boolean {
    if (virtualSysfsStore.has(path)) {
      virtualSysfsStore.set(path, String(value));
      return true;
    }
    const api = loadLibcFileApi();
    if (!api) return false;
    return writeFileWithLibc(api, path, String(value));
  }

  /**
   * Register a simulated /sys or /proc file entry for cross-platform testing.
   */
  static registerMockFile(path: string, content: string | number): void {
    virtualSysfsStore.set(path, String(content));
  }
}

export type DBusBusType = 'session' | 'system';
export type { DBusSignal, DBusTypedValue } from './dbus-native.js';

/**
 * Represents a proxy to a remote D-Bus object and interface.
 */
export class DBusProxy {
  readonly bus: DBusBusType;
  readonly service: string;
  readonly objectPath: string;
  readonly interfaceName: string;

  constructor(bus: DBusBusType, service: string, objectPath: string, interfaceName: string) {
    this.bus = bus;
    this.service = service;
    this.objectPath = objectPath;
    this.interfaceName = interfaceName;
  }

  /**
   * Call a D-Bus method on this interface.
   */
  callMethod<T = any>(methodName: string, ...args: any[]): T {
    return DBus.invokeMethod(this, methodName, ...args);
  }

  /**
   * Read a property via org.freedesktop.DBus.Properties.Get.
   */
  getProperty<T = any>(propertyName: string): T {
    return DBus.readProperty(this, propertyName);
  }

  /**
   * Write a property via org.freedesktop.DBus.Properties.Set.
   */
  setProperty(propertyName: string, value: any): void {
    DBus.writeProperty(this, propertyName, value);
  }

  /**
   * Subscribe to a D-Bus signal emitted by this interface.
   */
  onSignal(signalName: string, listener: (...args: any[]) => void): () => void {
    return DBus.addSignalListener(this, signalName, listener);
  }
}

const dbusMethodHandlers = new Map<string, (...args: any[]) => any>();
const dbusProperties = new Map<string, any>();
const dbusSignalListeners = new Map<string, Set<(...args: any[]) => void>>();

function makeDBusMemberKey(
  service: string,
  objectPath: string,
  interfaceName: string,
  member: string
): string {
  return `${service}::${objectPath}::${interfaceName}::${member}`;
}

/**
 * Linux D-Bus Inter-Process Communication Bridge (sd-bus / libdbus-1).
 * Provides access to UPower, BlueZ, NetworkManager, systemd, and Freedesktop Desktop portals.
 */
export class DBus {
  /**
   * Create a proxy for a remote D-Bus service object and interface.
   */
  static getProxy(
    bus: DBusBusType,
    service: string,
    objectPath: string,
    interfaceName: string
  ): DBusProxy {
    return new DBusProxy(bus, service, objectPath, interfaceName);
  }

  /**
   * Register a D-Bus method handler (for testing or service exporting).
   */
  static registerMethodHandler(
    service: string,
    objectPath: string,
    interfaceName: string,
    methodName: string,
    handler: (...args: any[]) => any
  ): void {
    const key = makeDBusMemberKey(service, objectPath, interfaceName, methodName);
    dbusMethodHandlers.set(key, handler);
  }

  /**
   * Register or update a D-Bus property value.
   */
  static registerProperty(
    service: string,
    objectPath: string,
    interfaceName: string,
    propertyName: string,
    value: any
  ): void {
    const key = makeDBusMemberKey(service, objectPath, interfaceName, propertyName);
    dbusProperties.set(key, value);
  }

  /**
   * Emit a D-Bus signal to all subscribed listeners.
   */
  static emitSignal(
    service: string,
    objectPath: string,
    interfaceName: string,
    signalName: string,
    ...args: any[]
  ): void {
    const key = makeDBusMemberKey(service, objectPath, interfaceName, signalName);
    const listeners = dbusSignalListeners.get(key);
    if (listeners) {
      for (const fn of listeners) {
        fn(...args);
      }
    }
  }

  /**
   * True when the native libdbus bridge is loaded (Linux/macOS with
   * `build:dbus-host` output, or GEA_FFI_DBUS_LIBRARY set).
   */
  static get nativeAvailable(): boolean {
    return nativeDBus !== null;
  }

  /** Close all native D-Bus connections opened by this module. */
  static close(): void {
    nativeDBus?.disconnectAll();
  }

  /** Add a match rule so incoming signals are queued for nextSignal(). */
  static addMatch(rule: string, bus: DBusBusType = 'session'): void {
    if (!nativeDBus) throw new Error('[GeaFFI:DBus] The native libdbus backend is not loaded.');
    nativeDBus.addMatch(bus === 'system' ? 1 : 0, rule);
  }

  /** Remove a previously installed signal match rule. */
  static removeMatch(rule: string, bus: DBusBusType = 'session'): void {
    if (!nativeDBus) throw new Error('[GeaFFI:DBus] The native libdbus backend is not loaded.');
    nativeDBus.removeMatch(bus === 'system' ? 1 : 0, rule);
  }

  /**
   * Wait for the next matching signal. Returns null on timeout.
   * A host event loop should call this from a timer or a worker thread.
   */
  static nextSignal(bus: DBusBusType = 'session', timeoutMs = 1000): DBusSignal | null {
    if (!nativeDBus) throw new Error('[GeaFFI:DBus] The native libdbus backend is not loaded.');
    return nativeDBus.nextSignal(bus === 'system' ? 1 : 0, timeoutMs);
  }

  /**
   * Call a method shaped `(s, a(sv)) -> u`, used by NGFD Play.
   * Properties accept strings, booleans, numbers, or DBus typed values.
   */
  static callWithProperties(
    service: string,
    objectPath: string,
    interfaceName: string,
    method: string,
    firstArgument: string,
    properties: Record<string, unknown> = {},
    bus: DBusBusType = 'system'
  ): number {
    if (!nativeDBus) throw new Error('[GeaFFI:DBus] The native libdbus backend is not loaded.');
    return nativeDBus.callStringPropertiesUint(
      bus === 'system' ? 1 : 0,
      service,
      objectPath,
      interfaceName,
      method,
      firstArgument,
      properties
    );
  }

  /** Mark a string argument as a D-Bus object path (`o`). */
  static objectPath(value: string): DBusTypedValue {
    return dbusObjectPath(value);
  }

  static bool(value: boolean): DBusTypedValue {
    return dbusBool(value);
  }

  static int32(value: number): DBusTypedValue {
    return dbusInt32(value);
  }

  static uint32(value: number): DBusTypedValue {
    return dbusUint32(value);
  }

  static int64(value: bigint): DBusTypedValue {
    return dbusInt64(value);
  }

  static uint64(value: bigint): DBusTypedValue {
    return dbusUint64(value);
  }

  static double(value: number): DBusTypedValue {
    return dbusDouble(value);
  }

  /** String array argument (`as`). */
  static stringArray(values: readonly string[]): DBusTypedValue {
    return dbusStringArray(values);
  }

  /** Byte array argument (`ay`). */
  static byteArray(values: Uint8Array): DBusTypedValue {
    return dbusByteArray(values);
  }

  /** Dictionary argument (`a{sv}`). */
  static dictionary(values: Record<string, unknown>): DBusTypedValue {
    return dbusDictionary(values);
  }

  /** Empty D-Bus array argument; pass the element signature, e.g. `(sv)`. */
  static emptyArray(elementSignature: string): DBusTypedValue {
    return dbusEmptyArray(elementSignature);
  }

  static invokeMethod(proxy: DBusProxy, methodName: string, ...args: any[]): any {
    const key = makeDBusMemberKey(proxy.service, proxy.objectPath, proxy.interfaceName, methodName);
    const handler = dbusMethodHandlers.get(key) || dbusMethodHandlers.get(`${proxy.interfaceName}::${methodName}`);
    if (handler) {
      return handler(...args);
    }

    if (nativeDBus) {
      const values = nativeDBus.call(
        proxy.bus === 'system' ? 1 : 0,
        proxy.service,
        proxy.objectPath,
        proxy.interfaceName,
        methodName,
        args
      );
      if (values.length === 0) return undefined;
      if (values.length === 1) return values[0];
      return values;
    }

    return undefined;
  }

  static readProperty(proxy: DBusProxy, propertyName: string): any {
    const key = makeDBusMemberKey(proxy.service, proxy.objectPath, proxy.interfaceName, propertyName);
    if (dbusProperties.has(key)) return dbusProperties.get(key);

    if (nativeDBus) {
      const values = nativeDBus.call(
        proxy.bus === 'system' ? 1 : 0,
        proxy.service,
        proxy.objectPath,
        'org.freedesktop.DBus.Properties',
        'Get',
        [proxy.interfaceName, propertyName]
      );
      return values.length > 0 ? values[0] : undefined;
    }
    return undefined;
  }

  static writeProperty(proxy: DBusProxy, propertyName: string, value: any): void {
    const key = makeDBusMemberKey(proxy.service, proxy.objectPath, proxy.interfaceName, propertyName);
    if (dbusProperties.has(key)) {
      dbusProperties.set(key, value);
      return;
    }
    if (nativeDBus) {
      nativeDBus.setProperty(
        proxy.bus === 'system' ? 1 : 0,
        proxy.service,
        proxy.objectPath,
        proxy.interfaceName,
        propertyName,
        value
      );
      return;
    }
    dbusProperties.set(key, value);
  }

  static addSignalListener(
    proxy: DBusProxy,
    signalName: string,
    listener: (...args: any[]) => void
  ): () => void {
    const key = makeDBusMemberKey(proxy.service, proxy.objectPath, proxy.interfaceName, signalName);
    let set = dbusSignalListeners.get(key);
    if (!set) {
      set = new Set();
      dbusSignalListeners.set(key, set);
    }
    set.add(listener);
    return () => {
      set?.delete(listener);
    };
  }
}
