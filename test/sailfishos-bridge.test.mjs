// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SailfishSystem,
  MCE,
  NGFD,
  DConf,
  Sailjail,
  generateSailfishBridge,
  getPlatformLibraryExtension,
  resolvePlatformLibraryName,
  registerMockFunction,
} from '../dist/index.js';

test('SailfishOS target resolves .so extension and Harbour allowed libraries', () => {
  assert.equal(getPlatformLibraryExtension('sailfishos'), '.so');
  assert.equal(resolvePlatformLibraryName('sailfishapp', 'sailfishos'), 'libsailfishapp.so');

  assert.equal(Sailjail.isHarbourAllowedLibrary('libsailfishapp.so.1'), true);
  assert.equal(Sailjail.isHarbourAllowedLibrary('libQt5Quick.so.5'), true);
  assert.equal(Sailjail.isHarbourAllowedLibrary('libngf0.so.0'), true);
  assert.equal(Sailjail.isHarbourAllowedLibrary('libcustom_unapproved.so'), false);
});

test('Sailjail generates valid [X-Sailjail] desktop section and XDG sandbox paths', () => {
  const desktopSection = Sailjail.generateDesktopSection({
    organizationName: 'com.geastack',
    applicationName: 'harbour-geawallet',
    permissions: ['Internet', 'Audio', 'Notifications', 'KeepAlive'],
  });

  assert(desktopSection.includes('[X-Sailjail]'));
  assert(desktopSection.includes('OrganizationName=com.geastack'));
  assert(desktopSection.includes('ApplicationName=harbour-geawallet'));
  assert(desktopSection.includes('Permissions=Internet;Audio;Notifications;KeepAlive;'));

  const paths = SailfishSystem.getAppPaths('com.geastack', 'harbour-geawallet');
  assert.equal(paths.dataDir, '/home/defaultuser/.local/share/com.geastack/harbour-geawallet');
  assert.equal(paths.packageShareDir, '/usr/share/harbour-geawallet');
});

test('MCE (Mode Control Entity) queries and subscribes to display, blanking, and battery states', () => {
  assert.equal(MCE.getDisplayStatus(), 'on');
  assert.equal(MCE.getBatteryLevel(), 85);
  assert.equal(MCE.isBlankingPrevented(), false);

  MCE.setPreventBlanking(true);
  assert.equal(MCE.isBlankingPrevented(), true);
  MCE.setPreventBlanking(false);
  assert.equal(MCE.isBlankingPrevented(), false);

  let latestDisplay = null;
  let latestBattery = null;
  const unsubDisplay = MCE.onDisplayStatusChanged((status) => {
    latestDisplay = status;
  });
  const unsubBattery = MCE.onBatteryLevelChanged((level) => {
    latestBattery = level;
  });

  MCE.simulateStateChange({ displayStatus: 'dimmed', batteryLevel: 72 });
  assert.equal(latestDisplay, 'dimmed');
  assert.equal(latestBattery, 72);
  assert.equal(MCE.getDisplayStatus(), 'dimmed');
  assert.equal(MCE.getBatteryLevel(), 72);

  unsubDisplay();
  unsubBattery();
});

test('NGFD (Non-Graphical Feedback Daemon) plays and stops pulley menu haptics', () => {
  const eventId = NGFD.play('pulley_highlight', { 'media.Vibra': true });
  assert(eventId > 0);
  assert.equal(NGFD.isPlaying(eventId), true);

  const stopped = NGFD.stop(eventId);
  assert.equal(stopped, true);
  assert.equal(NGFD.isPlaying(eventId), false);
});

test('DConf reads, writes, and watches Silica Ambiance & system keys', () => {
  assert.equal(DConf.read('/desktop/jolla/theme/color/highlight'), '#00b4ff');

  let observedChange = null;
  const unwatch = DConf.watch('/desktop/jolla/theme/', (key, value) => {
    observedChange = { key, value };
  });

  DConf.write('/desktop/jolla/theme/color/highlight', '#ff4500');
  assert.deepEqual(observedChange, {
    key: '/desktop/jolla/theme/color/highlight',
    value: '#ff4500',
  });
  assert.equal(DConf.read('/desktop/jolla/theme/color/highlight'), '#ff4500');

  unwatch();
});

test('SailfishSystem.openSystemLibrary and generateSailfishBridge work end-to-end', () => {
  registerMockFunction('libsailfishapp.so', 'SailfishApp_application', () => 0x700010n);

  const sfApp = SailfishSystem.openSystemLibrary('sailfishapp', {
    SailfishApp_application: {
      args: ['int32', 'pointer'],
      returns: 'pointer',
    },
  });

  assert.equal(sfApp.path, 'libsailfishapp.so');
  assert.equal(sfApp.symbols.SailfishApp_application(1, null), 0x700010n);
  sfApp.close();

  const cppCode = generateSailfishBridge({
    moduleName: 'harbour_sensor',
    functions: {
      read_proximity: {
        args: [],
        returns: 'bool',
      },
    },
  });
  assert(cppCode.includes('#include "gea/ffi/gea_ffi_sailfishos.h"'));
  assert(cppCode.includes('GEA_FFI_EXPORT bool read_proximity(void)'));
});
