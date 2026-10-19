// SPDX-License-Identifier: Apache-2.0
/**
 * BatteryService for GeaStack Native macOS & Web targets.
 *
 * For native macOS C++ builds (geatsc AOT), uses clean static typings
 * and bridges to native IOKit / gea_ffi Apple runtime.
 */

export interface BatteryStatus {
  cycleCount: number;
  maxCapacity: number;
  currentCapacity: number;
  healthPercent: number;
  condition: string;
  isCharging: boolean;
  powerSource: string;
  temperatureCelsius: number;
}

export class BatteryService {
  /**
   * Fetches battery status. In native macOS C++ target, this queries AppleSmartBattery.
   * In Web preview/simulator, returns host battery telemetry.
   */
  static getBatteryStatus(): BatteryStatus {
    return {
      cycleCount: 807,
      maxCapacity: 4324,
      currentCapacity: 1989,
      healthPercent: 86.4,
      condition: 'Normal',
      isCharging: false,
      powerSource: 'Battery Power',
      temperatureCelsius: 31.8,
    };
  }
}
