// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { defineStruct, computeStructLayout } from '../dist/index.js';

test('computeStructLayout calculates correct alignment and offsets', () => {
  const fields = {
    a: 'uint8',  // offset 0, size 1, align 1
    b: 'uint32', // offset 4 (3 bytes padding), size 4, align 4
    c: 'uint16', // offset 8, size 2, align 2
  };

  const { layout, totalSize, maxAlignment } = computeStructLayout(fields);

  assert.equal(layout.a.offset, 0);
  assert.equal(layout.b.offset, 4);
  assert.equal(layout.c.offset, 8);
  assert.equal(maxAlignment, 4);
  // Total size padded to multiple of maxAlignment (4) -> 8 + 2 = 10 -> padded to 12
  assert.equal(totalSize, 12);
});

test('defineStruct alloc, get, set, toObject, and free', () => {
  const Point = defineStruct('Point', {
    x: 'int32',
    y: 'int32',
    active: 'bool',
  });

  assert.equal(Point.name, 'Point');
  assert.equal(Point.fields.x.offset, 0);
  assert.equal(Point.fields.y.offset, 4);
  assert.equal(Point.fields.active.offset, 8);
  assert.equal(Point.size, 12);

  const pt = Point.alloc({ x: 100, y: -250, active: true });
  assert.equal(pt.get('x'), 100);
  assert.equal(pt.get('y'), -250);
  assert.equal(pt.get('active'), true);

  pt.set('x', 42);
  assert.equal(pt.get('x'), 42);

  const obj = pt.toObject();
  assert.deepEqual(obj, { x: 42, y: -250, active: true });

  pt.free();
});
