// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { ObjC } from '../dist/index.js';
import { adoptNativePointer } from '../dist/native-pointers.js';

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

  const NSNumber = ObjC.getClass('NSNumber');
  const numbers = ObjC.send(NSMutableArray, 'array', { args: [], returns: 'id' });
  for (const value of [3, 1, 2]) {
    const number = ObjC.send(NSNumber, 'numberWithInt:', { args: ['int'], returns: 'id' }, value);
    ObjC.send(numbers, 'addObject:', { args: ['id'], returns: 'void' }, number);
  }
  const comparator = ObjC.createNativeBlock((left, right) => {
    const leftValue = Number(ObjC.send(adoptNativePointer(BigInt(left)), 'intValue', { args: [], returns: 'int' }));
    const rightValue = Number(ObjC.send(adoptNativePointer(BigInt(right)), 'intValue', { args: [], returns: 'int' }));
    return BigInt(leftValue - rightValue);
  }, ['id', 'id'], 'long');
  const sorted = ObjC.send(numbers, 'sortedArrayUsingComparator:', { args: ['pointer'], returns: 'id' }, comparator);
  const sortedFirst = ObjC.send(sorted, 'objectAtIndex:', { args: ['ulong'], returns: 'id' }, 0);
  assert.equal(Number(ObjC.send(sortedFirst, 'intValue', { args: [], returns: 'int' })), 1);
  assert.equal(ObjC.releaseNativeBlock(comparator), true);

  // Verify Foundation retaining a copy of the block survives releaseNativeBlock() without UAF.
  let opRan = 0;
  const NSBlockOperation = ObjC.getClass('NSBlockOperation');
  const opBlock = ObjC.createNativeBlock(() => {
    opRan += 1;
  }, [], 'void');
  const op = ObjC.send(
    NSBlockOperation,
    'blockOperationWithBlock:',
    { args: ['pointer'], returns: 'id' },
    opBlock
  );
  assert.equal(ObjC.releaseNativeBlock(opBlock), true);
  // op still holds a Block_copy reference to opBlock; starting it must safely run the callback.
  ObjC.send(op, 'start', { args: [], returns: 'void' });
  assert.equal(opRan, 1);
});
