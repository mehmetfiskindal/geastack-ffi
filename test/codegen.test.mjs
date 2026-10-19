// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateCHeader,
  generateAppleObjCpp,
  generateAndroidJni,
  defineStruct,
} from '../dist/index.js';

test('generateCHeader produces valid C header with struct and functions', () => {
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
    },
  });

  assert(header.includes('#ifndef GEA_FFI_TEST_MODULE_H'));
  assert(header.includes('typedef struct Point {'));
  assert(header.includes('int32_t x;'));
  assert(header.includes('int32_t y;'));
  assert(header.includes('double compute_distance(Point* arg0, Point* arg1);'));
  assert(header.includes('void greet(const char* arg0);'));
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
  assert(code.includes('Java_com_geastack_app_NativeBridge_nativeVerify_token'));
  assert(code.includes('JNIEXPORT jboolean JNICALL'));
});
