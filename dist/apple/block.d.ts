/**
 * Native Objective-C global blocks backed by a tiny C helper.
 *
 * The helper builds a BLOCK_IS_GLOBAL layout whose invoke pointer is a koffi
 * callback. Blocks created here are real Objective-C blocks and can be passed
 * to Foundation methods; release them with releaseNativeBlock().
 */
import { Pointer } from '../memory.js';
import type { ObjCValueType } from './runtime.js';
/** True when the native Apple block helper is loaded. */
export declare function nativeBlocksAvailable(): boolean;
/**
 * Create a real global Objective-C block.
 * `args` describes the user-visible block arguments (the hidden block
 * argument is added automatically).
 */
export declare function createNativeBlock(callback: (...args: any[]) => void, args?: readonly ObjCValueType[]): Pointer;
/** Free a block created by createNativeBlock and unregister its callback. */
export declare function releaseNativeBlock(pointer: Pointer): boolean;
//# sourceMappingURL=block.d.ts.map