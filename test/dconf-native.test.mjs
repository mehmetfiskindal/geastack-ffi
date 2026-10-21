// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { DBus, DConf } from '../dist/index.js';

const native = DConf.nativeAvailable && process.env.GEA_FFI_DCONF_NATIVE_TEST === '1';
const nativeBus = DBus.nativeAvailable && process.env.GEA_FFI_DCONF_NATIVE_TEST === '1';
const prefix = '/com/geastack/ffi_test/';

test('DConf native backend writes and reads scalar values', { skip: !native }, () => {
  DConf.write(`${prefix}string`, 'hello');
  assert.equal(DConf.read(`${prefix}string`), 'hello');

  DConf.write(`${prefix}int`, 42);
  assert.equal(DConf.read(`${prefix}int`), 42);

  DConf.write(`${prefix}double`, 1.75);
  assert.equal(DConf.read(`${prefix}double`), 1.75);

  DConf.write(`${prefix}bool`, true);
  assert.equal(DConf.read(`${prefix}bool`), true);

  assert.equal(DConf.read(`${prefix}missing`, 'fallback'), 'fallback');

  let observed = null;
  const unwatch = DConf.watch(prefix, (key, value) => {
    observed = { key, value };
  });
  DConf.write(`${prefix}string`, 'updated');
  assert.deepEqual(observed, { key: `${prefix}string`, value: 'updated' });
  unwatch();
});

test('DConf native backend receives external change notifications', { skip: !native || !nativeBus }, () => {
  let observed = null;
  const unwatch = DConf.watch(prefix, (key, value) => {
    observed = { key, value };
  });
  DConf.addChangeMatch();
  const written = spawnSync('dconf', ['write', `${prefix}external`, '123'], { encoding: 'utf8' });
  assert.equal(written.status, 0, written.stderr);

  const change = DConf.nextChange(2000);
  assert.ok(change);
  assert.equal(change.key, `${prefix}external`);
  assert.equal(change.value, 123);
  assert.deepEqual(observed, { key: `${prefix}external`, value: 123 });
  unwatch();
});
