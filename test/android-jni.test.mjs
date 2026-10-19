// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { JNI, JNISignature, JNIClass, Pointer } from '../dist/index.js';

test('JNISignature builds valid method and type signatures', () => {
  const sig1 = JNISignature.method(JNISignature.INT, JNISignature.STRING, JNISignature.BOOLEAN);
  assert.equal(sig1, '(Ljava/lang/String;Z)I');

  const sig2 = JNISignature.method(
    'Lcom/google/firebase/appcheck/FirebaseAppCheck;',
    'Landroid/content/Context;'
  );
  assert.equal(sig2, '(Landroid/content/Context;)Lcom/google/firebase/appcheck/FirebaseAppCheck;');

  const arrSig = JNISignature.array(JNISignature.BYTE);
  assert.equal(arrSig, '[B');
});

test('JNI class and method invocation with mock handlers', () => {
  const className = 'com/google/firebase/appcheck/FirebaseAppCheck';
  const appCheckClass = JNI.findClass(className);

  assert.equal(appCheckClass.name, className);
  assert.equal(appCheckClass.pointer.isNull(), false);

  // Register mock handler for getInstance
  const mockInstancePtr = new Pointer(0x77777777n);
  JNI.registerHandler(`${className}#getInstance`, () => mockInstancePtr);

  const instance = appCheckClass.callStaticMethod('getInstance', '()Lcom/google/firebase/appcheck/FirebaseAppCheck;');
  assert.equal(instance.address, mockInstancePtr.address);
});
