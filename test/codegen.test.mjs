// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateCHeader,
  generateAppleObjCpp,
  generateAndroidJni,
  generateWindowsBridge,
  generateLinuxBridge,
  defineStruct,
} from '../dist/index.js';

test('generateCHeader produces valid C header with struct, functions, and export macros', () => {
  const Point = defineStruct('Point', {
    x: 'int32',
    y: 'int32',
  });

  const header = generateCHeader({
    moduleName: 'test_module',
    structs: { Point },
    functions: {
      compute_distance: {
        args: [Point, Point],
        returns: 'double',
      },
      greet: {
        args: ['string'],
        returns: 'void',
      },
      greet_wide: {
        args: ['wstring'],
        returns: 'wstring',
      },
    },
  });

  assert(header.includes('#ifndef GEA_FFI_TEST_MODULE_H'));
  assert(header.includes('#define GEA_FFI_EXPORT __declspec(dllexport)'));
  assert(header.includes('typedef struct Point {'));
  assert(header.includes('int32_t x;'));
  assert(header.includes('int32_t y;'));
  assert(header.includes('double compute_distance(Point* arg0, Point* arg1);'));
  assert(header.includes('void greet(const char* arg0);'));
  assert(header.includes('const wchar_t* greet_wide(const wchar_t* arg0);'));
});

test('generateAppleObjCpp produces Objective-C++ bridge', () => {
  const code = generateAppleObjCpp({
    moduleName: 'apple_test',
    functions: {
      get_device_model: {
        args: [],
        returns: 'string',
      },
    },
  });

  assert(code.includes('#import <Foundation/Foundation.h>'));
  assert(code.includes('const char* get_device_model(void)'));
});

test('generateAndroidJni produces Android JNI C++ bridge', () => {
  const code = generateAndroidJni(
    {
      moduleName: 'android_test',
      functions: {
        verify_token: {
          args: ['string', 'bool'],
          returns: 'bool',
        },
      },
    },
    'com.geastack.app',
    'NativeBridge'
  );

  assert(code.includes('#include <jni.h>'));
  assert(code.includes('Java_com_geastack_app_NativeBridge_nativeVerifyToken'));
  assert(code.includes('JNIEXPORT jboolean JNICALL'));
});

test('generateWindowsBridge and generateLinuxBridge produce native bridges', () => {
  const winCode = generateWindowsBridge({
    moduleName: 'win_power',
    functions: {
      get_battery_percent: {
        args: [],
        returns: 'int32',
      },
    },
  });
  assert(winCode.includes('#include <windows.h>'));
  assert(winCode.includes('GEA_FFI_EXPORT int32_t get_battery_percent(void)'));

  const linuxCode = generateLinuxBridge({
    moduleName: 'linux_power',
    functions: {
      get_battery_percent: {
        args: [],
        returns: 'int32',
      },
    },
  });
  assert(linuxCode.includes('#include <dlfcn.h>'));
  assert(linuxCode.includes('GEA_FFI_EXPORT int32_t get_battery_percent(void)'));
});
