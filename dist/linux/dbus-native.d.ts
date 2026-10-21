/**
 * Koffi binding for the native libdbus bridge.
 *
 * The shared library is built by `npm run build:dbus-host`. When it is absent
 * (or libdbus is not installed), `nativeDBus` is null and the TypeScript DBus
 * helpers keep their in-process simulation.
 */
export declare const DBUS_KIND: {
    readonly STRING: 1;
    readonly OBJECT_PATH: 2;
    readonly BOOLEAN: 3;
    readonly INT32: 4;
    readonly UINT32: 5;
    readonly INT64: 6;
    readonly UINT64: 7;
    readonly DOUBLE: 8;
};
interface NativeLibrary {
    readonly connect: (busType: number, out: bigint) => number;
    readonly disconnect: (connection: bigint) => void;
    readonly call: (connection: bigint, service: string, objectPath: string, interfaceName: string, method: string, args: bigint | null, argCount: number, results: bigint, resultCapacity: number, resultCount: bigint) => number;
    readonly lastError: () => string;
    readonly free: (pointer: bigint) => void;
    readonly uniqueName: (connection: bigint) => string;
}
export interface DBusTypedValue {
    readonly kind: number;
    readonly value: string | number | bigint | boolean;
}
export declare function dbusObjectPath(value: string): DBusTypedValue;
export declare function dbusInt32(value: number): DBusTypedValue;
export declare function dbusUint32(value: number): DBusTypedValue;
export declare function dbusInt64(value: bigint): DBusTypedValue;
export declare function dbusUint64(value: bigint): DBusTypedValue;
export declare function dbusDouble(value: number): DBusTypedValue;
export declare class NativeDBus {
    private readonly library;
    private readonly connections;
    constructor(library: NativeLibrary);
    get available(): boolean;
    private connection;
    uniqueName(busType: number): string;
    call(busType: number, service: string, objectPath: string, interfaceName: string, method: string, args: readonly unknown[]): unknown[];
    disconnect(busType: number): void;
    disconnectAll(): void;
}
export declare const nativeDBus: NativeDBus | null;
export {};
//# sourceMappingURL=dbus-native.d.ts.map