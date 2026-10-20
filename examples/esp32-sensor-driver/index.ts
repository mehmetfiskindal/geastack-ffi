// SPDX-License-Identifier: Apache-2.0
/**
 * Example: Embedded Microcontroller Peripheral Driver with @geastack/ffi
 *
 * API sketch. NativeRegistry in the Node host is an in-process map, not an ESP32 image.
 */

import { NativeRegistry } from '../../dist/index.js';

export interface BME280Sample {
  temperature: number;
  humidity: number;
  pressure: number;
}

export class BME280Sensor {
  static init(i2cPort = 0, address = 0x76): boolean {
    if (NativeRegistry.has('bme280_init')) {
      return NativeRegistry.call('bme280_init', i2cPort, address);
    }
    return false;
  }

  static readSample(): BME280Sample {
    if (NativeRegistry.has('bme280_read')) {
      return NativeRegistry.call('bme280_read');
    }
    return { temperature: 24.5, humidity: 45.2, pressure: 1013.25 };
  }
}
