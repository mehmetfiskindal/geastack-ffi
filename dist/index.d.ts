/**
 * @geastack/ffi
 * Foreign Function Interface and Native Interop runtime for GeaStack.
 *
 * Supports:
 * - Dynamic C library loading (dlopen / LoadLibrary)
 * - Standard C ABI struct layouts and memory alignment
 * - Direct native memory allocation and pointers
 * - Apple (iOS & macOS) Objective-C / Swift runtime bridging
 * - Android Java / Kotlin JNI bridging
 * - Embedded microcontroller (ESP32, RP2350, geaos) static AOT registry
 * - Automatic C/Obj-C++/JNI code generation
 */
export * from './types.js';
export * from './memory.js';
export * from './struct.js';
export * from './library.js';
export { ObjC, ObjCClass, ObjCObject, ObjCSelector } from './apple/index.js';
export { JNI, JNIClass, JNIObject, JNIMethod, JNISignature } from './android/index.js';
export { Win32, WinRegistry, COM, COMObject, HRESULT, HKEY } from './windows/index.js';
export { POSIX, Sysfs, DBus, DBusProxy, ERRNO } from './linux/index.js';
export { SailfishSystem, MCE, NGFD, DConf, Sailjail, HARBOUR_ALLOWED_LIBRARIES, } from './sailfishos/index.js';
export { NativeRegistry } from './embedded/index.js';
export { generateCHeader, generateAppleObjCpp, generateAndroidJni, generateWindowsBridge, generateLinuxBridge, generateSailfishBridge, } from './codegen/index.js';
export { createFfiCompilerPlugin } from './plugin/index.js';
//# sourceMappingURL=index.d.ts.map