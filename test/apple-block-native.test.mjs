// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { ObjC } from '../dist/index.js';

const native = process.platform === 'darwin' && process.env.GEA_APPLE_BLOCK_TEST === '1';

test('ObjC native blocks are invoked by Foundation', { skip: !native }, () => {
  const NSString = ObjC.getClass('NSString');
  const NSMutableArray = ObjC.getClass('NSMutableArray');
  const array = ObjC.send(NSMutableArray, 'array', { args: [], returns: 'id' });
  const first = ObjC.send(NSString, 'stringWithUTF8String:', { args: ['string'], returns: 'id' }, 'a');
  const second = ObjC.send(NSString, 'stringWithUTF8String:', { args: ['string'], returns: 'id' }, 'b');
  ObjC.send(array, 'addObject:', { args: ['id'], returns: 'void' }, first);
  ObjC.send(array, 'addObject:', { args: ['id'], returns: 'void' }, second);

  let count = 0;
  const block = ObjC.createNativeBlock((_object, index) => {
    count += Number(index) + 1;
  }, ['id', 'ulong', 'pointer']);
  assert.equal(block.isNull(), false);
  assert.equal(ObjC.nativeBlocksAvailable, true);

  ObjC.send(array, 'enumerateObjectsUsingBlock:', { args: ['pointer'], returns: 'void' }, block);
  assert.equal(count, 3);
  assert.equal(ObjC.releaseNativeBlock(block), true);
  assert.equal(ObjC.releaseNativeBlock(block), false);
});
