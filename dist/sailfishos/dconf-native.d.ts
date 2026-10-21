/**
 * Koffi binding for the native libdconf bridge.
 */
interface DconfLibrary {
    readonly available: () => boolean;
    readonly read: (key: string, result: bigint) => number;
    readonly write: (key: string, value: bigint) => number;
    readonly lastError: () => string;
    readonly free: (pointer: bigint) => void;
}
export declare class NativeDConf {
    private readonly library;
    constructor(library: DconfLibrary);
    get available(): boolean;
    read(key: string): unknown | null;
    write(key: string, value: unknown): void;
}
export declare const nativeDConf: NativeDConf | null;
export {};
//# sourceMappingURL=dconf-native.d.ts.map