// SPDX-License-Identifier: Apache-2.0
/**
 * Koffi binding for the native libdbus bridge.
 *
 * The shared library is built by `npm run build:dbus-host`. When it is absent
 * (or libdbus is not installed), `nativeDBus` is null and the TypeScript DBus
 * helpers keep their in-process simulation.
 */

import koffi from 'koffi';

declare const process: {
  platform?: string;
  env: Record<string, string | undefined>;
  cwd(): string;
};

export const DBUS_KIND = {
  STRING: 1,
  OBJECT_PATH: 2,
  BOOLEAN: 3,
  INT32: 4,
  UINT32: 5,
  INT64: 6,
  UINT64: 7,
  DOUBLE: 8,
} as const;

const DBusUnion = koffi.union({
  str: 'void *',
  b: 'uint8',
  i32: 'int32',
  u32: 'uint32',
  i64: 'int64',
  u64: 'uint64',
  d: 'double',
});

const DBusValue = koffi.struct({
  kind: 'int32',
  as: DBusUnion,
});

const VALUE_SIZE = koffi.sizeof(DBusValue);
const UNION_OFFSET = koffi.offsetof(DBusValue, 'as');
const RESULT_CAPACITY = 8;

interface NativeLibrary {
  readonly connect: (busType: number, out: bigint) => number;
  readonly disconnect: (connection: bigint) => void;
  readonly call: (
    connection: bigint, service: string, objectPath: string, interfaceName: string, method: string,
    args: bigint | null, argCount: number,
    results: bigint, resultCapacity: number, resultCount: bigint
  ) => number;
  readonly lastError: () => string;
  readonly free: (pointer: bigint) => void;
  readonly uniqueName: (connection: bigint) => string;
}

function candidatePaths(): string[] {
  const names = process.platform === 'darwin'
    ? ['libgea_ffi_dbus.dylib']
    : ['libgea_ffi_dbus.so'];
  const candidates: string[] = [];
  const configured = process.env.GEA_FFI_DBUS_LIBRARY;
  if (configured) candidates.push(configured);

  const base = `${process.cwd()}/build/dbus-native`;
  for (const name of names) candidates.push(`${base}/${name}`);
  return candidates;
}

function loadLibrary(): NativeLibrary | null {
  for (const libraryPath of candidatePaths()) {
    try {
      const lib = koffi.load(libraryPath);
      return {
        connect: lib.func('gea_ffi_dbus_connect', 'int32', ['int32', 'void **']),
        disconnect: lib.func('gea_ffi_dbus_disconnect', 'void', ['void *']),
        call: lib.func('gea_ffi_dbus_call', 'int32', [
        'void *', 'const char *', 'const char *', 'const char *', 'const char *',
        koffi.pointer(DBusValue), 'int32',
        koffi.pointer(DBusValue), 'int32', koffi.pointer('int32'),
      ]),
        lastError: lib.func('gea_ffi_dbus_last_error', 'const char *', []),
        free: lib.func('gea_ffi_dbus_free', 'void', ['void *']),
        uniqueName: lib.func('gea_ffi_dbus_unique_name', 'const char *', ['void *']),
      };
    } catch {
      // Try the next candidate path.
    }
  }
  return null;
}

export interface DBusTypedValue {
  readonly kind: number;
  readonly value: string | number | bigint | boolean;
}

export function dbusObjectPath(value: string): DBusTypedValue {
  return { kind: DBUS_KIND.OBJECT_PATH, value };
}

export function dbusInt32(value: number): DBusTypedValue {
  return { kind: DBUS_KIND.INT32, value };
}

export function dbusUint32(value: number): DBusTypedValue {
  return { kind: DBUS_KIND.UINT32, value };
}

export function dbusInt64(value: bigint): DBusTypedValue {
  return { kind: DBUS_KIND.INT64, value };
}

export function dbusUint64(value: bigint): DBusTypedValue {
  return { kind: DBUS_KIND.UINT64, value };
}

export function dbusDouble(value: number): DBusTypedValue {
  return { kind: DBUS_KIND.DOUBLE, value };
}

function isTyped(value: unknown): value is DBusTypedValue {
  return typeof value === 'object' && value !== null && 'kind' in value && 'value' in value;
}

function classify(value: unknown): { kind: number; value: string | number | bigint | boolean } {
  if (isTyped(value)) return { kind: value.kind, value: value.value };
  if (typeof value === 'string') return { kind: DBUS_KIND.STRING, value };
  if (typeof value === 'boolean') return { kind: DBUS_KIND.BOOLEAN, value };
  if (typeof value === 'bigint') {
    return value < 0n
      ? { kind: DBUS_KIND.INT64, value }
      : { kind: DBUS_KIND.UINT64, value };
  }
  if (typeof value === 'number') {
    if (Number.isInteger(value) && value >= -2147483648 && value <= 2147483647) {
      return { kind: DBUS_KIND.INT32, value };
    }
    if (Number.isInteger(value) && value >= 0 && value <= 4294967295) {
      return { kind: DBUS_KIND.UINT32, value };
    }
    return { kind: DBUS_KIND.DOUBLE, value };
  }
  throw new Error(`[GeaFFI:DBus] Unsupported argument value ${String(value)}.`);
}

function allocCString(value: string): bigint {
  const encoded = new TextEncoder().encode(value);
  const pointer = koffi.alloc('char', encoded.length + 1);
  koffi.encode(pointer, 'char', [...encoded, 0], encoded.length + 1);
  return pointer;
}

function decodeValue(pointer: bigint, index: number, backend: NativeLibrary): unknown {
  const base = index * VALUE_SIZE;
  const kind = Number(koffi.decode(pointer, base, 'int32'));
  switch (kind) {
    case DBUS_KIND.STRING:
    case DBUS_KIND.OBJECT_PATH: {
      const stringPointer = koffi.decode(pointer, base + UNION_OFFSET, 'void *');
      if (stringPointer === null || stringPointer === undefined || BigInt(stringPointer) === 0n) return '';
      const text = String(koffi.decode(stringPointer, 'char', -1));
      backend.free(BigInt(stringPointer));
      return text;
    }
    case DBUS_KIND.BOOLEAN:
      return Number(koffi.decode(pointer, base + UNION_OFFSET, 'uint8')) !== 0;
    case DBUS_KIND.INT32:
      return Number(koffi.decode(pointer, base + UNION_OFFSET, 'int32'));
    case DBUS_KIND.UINT32:
      return Number(koffi.decode(pointer, base + UNION_OFFSET, 'uint32'));
    case DBUS_KIND.INT64:
      return BigInt(koffi.decode(pointer, base + UNION_OFFSET, 'int64'));
    case DBUS_KIND.UINT64:
      return BigInt(koffi.decode(pointer, base + UNION_OFFSET, 'uint64'));
    case DBUS_KIND.DOUBLE:
      return Number(koffi.decode(pointer, base + UNION_OFFSET, 'double'));
    default:
      throw new Error(`[GeaFFI:DBus] Unsupported reply kind ${kind}.`);
  }
}

export class NativeDBus {
  private readonly library: NativeLibrary;
  private readonly connections = new Map<number, bigint>();

  constructor(library: NativeLibrary) {
    this.library = library;
  }

  get available(): boolean {
    return true;
  }

  private connection(busType: number): bigint {
    const existing = this.connections.get(busType);
    if (existing !== undefined) return existing;

    const out = koffi.alloc('void *', 1);
    try {
      const status = this.library.connect(busType, out);
      if (status !== 0) {
        throw new Error(`[GeaFFI:DBus] Could not connect to the ${busType === 1 ? 'system' : 'session'} bus: ${this.library.lastError()}`);
      }
      const handle = koffi.decode(out, 'void *');
      if (handle === null || handle === undefined || BigInt(handle) === 0n) {
        throw new Error('[GeaFFI:DBus] The bus returned a null connection.');
      }
      const connection = BigInt(handle);
      this.connections.set(busType, connection);
      return connection;
    } finally {
      koffi.free(out);
    }
  }

  uniqueName(busType: number): string {
    return this.library.uniqueName(this.connection(busType));
  }

  call(
    busType: number,
    service: string,
    objectPath: string,
    interfaceName: string,
    method: string,
    args: readonly unknown[]
  ): unknown[] {
    const connection = this.connection(busType);
    const prepared = args.map(classify);
    const stringPointers: bigint[] = [];
    const argsPointer = prepared.length > 0 ? koffi.alloc(DBusValue, prepared.length) : null;
    const resultsPointer = koffi.alloc(DBusValue, RESULT_CAPACITY);
    const countPointer = koffi.alloc('int32', 1);

    try {
      koffi.encode(countPointer, 'int32', 0);

      prepared.forEach((entry, index) => {
        const base = index * VALUE_SIZE;
        koffi.encode(argsPointer!, base, 'int32', entry.kind);
        switch (entry.kind) {
          case DBUS_KIND.STRING:
          case DBUS_KIND.OBJECT_PATH: {
            const pointer = allocCString(String(entry.value));
            stringPointers.push(pointer);
            koffi.encode(argsPointer!, base + UNION_OFFSET, 'void *', pointer);
            break;
          }
          case DBUS_KIND.BOOLEAN:
            koffi.encode(argsPointer!, base + UNION_OFFSET, 'uint8', entry.value ? 1 : 0);
            break;
          case DBUS_KIND.INT32:
            koffi.encode(argsPointer!, base + UNION_OFFSET, 'int32', Number(entry.value));
            break;
          case DBUS_KIND.UINT32:
            koffi.encode(argsPointer!, base + UNION_OFFSET, 'uint32', Number(entry.value));
            break;
          case DBUS_KIND.INT64:
            koffi.encode(argsPointer!, base + UNION_OFFSET, 'int64', BigInt(entry.value));
            break;
          case DBUS_KIND.UINT64:
            koffi.encode(argsPointer!, base + UNION_OFFSET, 'uint64', BigInt(entry.value));
            break;
          case DBUS_KIND.DOUBLE:
            koffi.encode(argsPointer!, base + UNION_OFFSET, 'double', Number(entry.value));
            break;
          default:
            throw new Error(`[GeaFFI:DBus] Unsupported argument kind ${entry.kind}.`);
        }
      });

      const status = this.library.call(
        connection,
        service,
        objectPath,
        interfaceName,
        method,
        argsPointer,
        prepared.length,
        resultsPointer,
        RESULT_CAPACITY,
        countPointer
      );
      if (status !== 0) {
        throw new Error(`[GeaFFI:DBus] ${interfaceName}.${method} failed: ${this.library.lastError()}`);
      }

      const count = Number(koffi.decode(countPointer, 'int32'));
      const values: unknown[] = [];
      for (let i = 0; i < count; i++) {
        values.push(decodeValue(resultsPointer, i, this.library));
      }
      return values;
    } finally {
      for (const pointer of stringPointers) koffi.free(pointer);
      if (argsPointer !== null) koffi.free(argsPointer);
      koffi.free(resultsPointer);
      koffi.free(countPointer);
    }
  }

  disconnect(busType: number): void {
    const connection = this.connections.get(busType);
    if (connection === undefined) return;
    this.library.disconnect(connection);
    this.connections.delete(busType);
  }

  disconnectAll(): void {
    for (const busType of [...this.connections.keys()]) {
      this.disconnect(busType);
    }
  }
}

function createBackend(): NativeDBus | null {
  if (typeof process === 'undefined' || (process.platform !== 'linux' && process.platform !== 'darwin')) {
    return null;
  }
  const library = loadLibrary();
  return library ? new NativeDBus(library) : null;
}

export const nativeDBus: NativeDBus | null = createBackend();
