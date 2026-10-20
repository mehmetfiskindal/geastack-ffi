import test from 'node:test'
import assert from 'node:assert/strict'
import { readSailfishDemo } from '../src/sailfish-probe.ts'

const expectedDesktop = [
  '[X-Sailjail]',
  'OrganizationName=com.geastack',
  'ApplicationName=harbour-geaffi',
  'Permissions=Internet;Audio;Notifications;',
].join('\n')

test('sailfish demo builds the desktop section, paths, and Harbour list', () => {
  const snapshot = readSailfishDemo()
  assert.equal(snapshot.desktop, expectedDesktop)
  assert.equal(snapshot.paths.dataDir, '/home/defaultuser/.local/share/com.geastack/harbour-geaffi')
  assert.equal(snapshot.paths.configDir, '/home/defaultuser/.config/com.geastack/harbour-geaffi')
  assert.equal(snapshot.paths.cacheDir, '/home/defaultuser/.cache/com.geastack/harbour-geaffi')
  assert.equal(snapshot.paths.packageShareDir, '/usr/share/harbour-geaffi')
  assert.equal(snapshot.harbour.libc, true)
  assert.equal(snapshot.harbour.libm, true)
  assert.equal(snapshot.harbour.unknown, false)
})

test('sailfish demo calls libc on linux and reports a load error elsewhere', () => {
  const snapshot = readSailfishDemo()
  if (process.platform === 'linux') {
    assert.equal(snapshot.ffi.ok, true)
    if (snapshot.ffi.ok) {
      assert.equal(snapshot.ffi.pid, process.pid)
      assert.equal(snapshot.ffi.strlen, 8)
    }
    return
  }
  assert.equal(snapshot.ffi.ok, false)
  if (!snapshot.ffi.ok) {
    assert.match(snapshot.ffi.error, /Failed to load shared library 'libc\.so\.6'/)
  }
})
