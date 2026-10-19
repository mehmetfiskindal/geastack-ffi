/**
 * @geastack/ffi - Embedded & AOT Static Symbol Registry
 * For microcontrollers (ESP32, RP2350, geaos) and targets without dynamic shared libraries (dlopen).
 */
export type NativeFunctionHandler = (...args: any[]) => any;
export interface RegisteredNativeModule {
    readonly name: string;
    readonly symbols: Record<string, NativeFunctionHandler>;
}
/**
 * Embedded Native Function Registry.
 * On firmware and AOT targets, symbols are linked statically at compile time and registered
 * into this table during chip / target initialization.
 */
export declare class NativeRegistry {
    private static symbols;
    private static modules;
    /**
     * Register a native function symbol.
     */
    static register(symbolName: string, handler: NativeFunctionHandler): void;
    /**
     * Register a group of native functions under a module name.
     */
    static registerModule(moduleName: string, symbols: Record<string, NativeFunctionHandler>): void;
    /**
     * Look up a registered native function.
     */
    static get(symbolName: string): NativeFunctionHandler | undefined;
    /**
     * Check if a symbol is registered.
     */
    static has(symbolName: string): boolean;
    /**
     * Invoke a registered native function directly.
     */
    static call<TReturn = any>(symbolName: string, ...args: any[]): TReturn;
    /**
     * List all registered symbol names.
     */
    static listSymbols(): string[];
    /**
     * Clear all symbols (used for test teardown).
     */
    static clear(): void;
}
//# sourceMappingURL=index.d.ts.map