/**
 * @geastack/ffi - GeaStack Compiler Extension Plugin
 * Plugs into @geastack/compiler (geatsc) to handle FFI symbols and C++ AOT emissions.
 */
export interface GeaCompilerPlugin {
    readonly name: string;
    readonly version: string;
    readonly headers: readonly string[];
    readonly nativeSources: readonly string[];
    readonly definitions?: readonly {
        condition: string | null;
        definition: string;
    }[];
}
/**
 * Creates the compiler plugin descriptor for @geastack/ffi.
 */
export declare function createFfiCompilerPlugin(): GeaCompilerPlugin;
export default createFfiCompilerPlugin;
//# sourceMappingURL=index.d.ts.map