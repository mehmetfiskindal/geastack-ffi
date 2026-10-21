// SPDX-License-Identifier: Apache-2.0
/**
 * @geastack/ffi
 * Foreign Function Interface and Native Interop package for GeaStack.
 *
 * The Node host can load shared libraries and call C functions.
 * The Apple, Android, Windows COM/registry, Linux D-Bus, Sailfish, and embedded
 * JavaScript bridges in this package are in-process simulations unless noted
 * in the README platform table.
 */
export * from './types.js';
export * from './memory.js';
export * from './struct.js';
export * from './library.js';
export { CallbackHandle, createCallback } from './host-backend.js';
// Submodule exports
export { ObjC, ObjCClass, ObjCObject, ObjCSelector } from './apple/index.js';
export { JNI, JNIClass, JNIObject, JNIMethod, JNISignature } from './android/index.js';
export { Win32, WinRegistry, COM, COMObject, HRESULT, HKEY } from './windows/index.js';
export { POSIX, Sysfs, DBus, DBusProxy, ERRNO } from './linux/index.js';
export { SailfishSystem, MCE, NGFD, DConf, Sailjail, HARBOUR_ALLOWED_LIBRARIES, } from './sailfishos/index.js';
export { NativeRegistry } from './embedded/index.js';
export { generateCHeader, generateAppleObjCpp, generateAndroidJni, generateWindowsBridge, generateLinuxBridge, generateSailfishBridge, } from './codegen/index.js';
export { createFfiCompilerPlugin } from './plugin/index.js';
export { NativeMemory } from './native-memory.js';
//# sourceMappingURL=index.js.map