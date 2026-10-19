// SPDX-License-Identifier: Apache-2.0
/**
 * @geastack/ffi - Embedded & AOT Static Symbol Registry
 * For microcontrollers (ESP32, RP2350, geaos) and targets without dynamic shared libraries (dlopen).
 */
/**
 * Embedded Native Function Registry.
 * On firmware and AOT targets, symbols are linked statically at compile time and registered
 * into this table during chip / target initialization.
 */
export class NativeRegistry {
    static symbols = new Map();
    static modules = new Map();
    /**
     * Register a native function symbol.
     */
    static register(symbolName, handler) {
        this.symbols.set(symbolName, handler);
    }
    /**
     * Register a group of native functions under a module name.
     */
    static registerModule(moduleName, symbols) {
        let mod = this.modules.get(moduleName);
        if (!mod) {
            mod = new Map();
            this.modules.set(moduleName, mod);
        }
        for (const [sym, fn] of Object.entries(symbols)) {
            mod.set(sym, fn);
            // Also register in global symbol table as "module:symbol"
            this.symbols.set(`${moduleName}:${sym}`, fn);
        }
    }
    /**
     * Look up a registered native function.
     */
    static get(symbolName) {
        return this.symbols.get(symbolName);
    }
    /**
     * Check if a symbol is registered.
     */
    static has(symbolName) {
        return this.symbols.has(symbolName);
    }
    /**
     * Invoke a registered native function directly.
     */
    static call(symbolName, ...args) {
        const fn = this.symbols.get(symbolName);
        if (!fn) {
            throw new Error(`[GeaFFI] EmbeddedSymbolNotFound: Native symbol '${symbolName}' is not registered in firmware table.`);
        }
        return fn(...args);
    }
    /**
     * List all registered symbol names.
     */
    static listSymbols() {
        return Array.from(this.symbols.keys());
    }
    /**
     * Clear all symbols (used for test teardown).
     */
    static clear() {
        this.symbols.clear();
        this.modules.clear();
    }
}
//# sourceMappingURL=index.js.map