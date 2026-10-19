// SPDX-License-Identifier: Apache-2.0
/**
 * @geastack/ffi - Embedded & AOT Static Symbol Registry
 * For microcontrollers (ESP32, RP2350, geaos) and targets without dynamic shared libraries (dlopen).
 */

import { FunctionDescriptor, FFITypeToTypeScript } from '../types.js';

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
export class NativeRegistry {
  private static symbols = new Map<string, NativeFunctionHandler>();
  private static modules = new Map<string, Map<string, NativeFunctionHandler>>();

  /**
   * Register a native function symbol.
   */
  static register(symbolName: string, handler: NativeFunctionHandler): void {
    this.symbols.set(symbolName, handler);
  }

  /**
   * Register a group of native functions under a module name.
   */
  static registerModule(moduleName: string, symbols: Record<string, NativeFunctionHandler>): void {
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
  static get(symbolName: string): NativeFunctionHandler | undefined {
    return this.symbols.get(symbolName);
  }

  /**
   * Check if a symbol is registered.
   */
  static has(symbolName: string): boolean {
    return this.symbols.has(symbolName);
  }

  /**
   * Invoke a registered native function directly.
   */
  static call<TReturn = any>(symbolName: string, ...args: any[]): TReturn {
    const fn = this.symbols.get(symbolName);
    if (!fn) {
      throw new Error(`[GeaFFI] EmbeddedSymbolNotFound: Native symbol '${symbolName}' is not registered in firmware table.`);
    }
    return fn(...args);
  }

  /**
   * List all registered symbol names.
   */
  static listSymbols(): string[] {
    return Array.from(this.symbols.keys());
  }

  /**
   * Clear all symbols (used for test teardown).
   */
  static clear(): void {
    this.symbols.clear();
    this.modules.clear();
  }
}
