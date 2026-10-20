import { defineConfig, type Plugin } from 'vite'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

interface WindowsHostBatteryPayload {
  platform: 'windows'
  batteryId: string
  manufacturer: string
  chemistry: string
  systemProductName: string
  designCapacity: number
  fullChargeCapacity: number
  currentCapacity: number
  cycleCount: number
  acOnline: boolean
  isCharging: boolean
  temperatureCelsius: number
}

interface MacosHostBatteryPayload {
  platform: 'macos'
  deviceModel: string
  batteryModel: string
  designCapacity: number
  maxCapacity: number
  currentCapacity: number
  cycleCount: number
  acOnline: boolean
  isCharging: boolean
  temperatureCelsius: number
}

function extractXmlTag(xml: string, tag: string): string {
  const match = new RegExp(`<${tag}>([^<]*)</${tag}>`, 'i').exec(xml)
  return match ? match[1].trim() : ''
}

function extractXmlAttr(tagText: string, attr: string): string {
  const match = new RegExp(`\\b${attr}="([^"]*)"`, 'i').exec(tagText)
  return match ? match[1].trim() : ''
}

function queryWindowsHostBattery(): WindowsHostBatteryPayload | null {
  if (process.platform !== 'win32') return null

  const xmlPath = path.join(os.tmpdir(), `gea-win-battery-${process.pid}.xml`)
  try {
    execFileSync('powercfg', ['/batteryreport', '/xml', '/output', xmlPath], {
      stdio: 'ignore',
      timeout: 4000,
    })
    if (!fs.existsSync(xmlPath)) return null
    const xml = fs.readFileSync(xmlPath, 'utf8')

    const sysInfoBlock = /<SystemInformation>([\s\S]*?)<\/SystemInformation>/i.exec(xml)?.[1] || ''
    const sysManuf = extractXmlTag(sysInfoBlock, 'SystemManufacturer')
    const sysProduct = extractXmlTag(sysInfoBlock, 'SystemProductName')
    const systemProductName = [sysManuf, sysProduct].filter(Boolean).join(' ') || 'Windows PC'

    const batteryBlock = /<Batteries>\s*<Battery>([\s\S]*?)<\/Battery>/i.exec(xml)?.[1] || ''
    const batteryId = extractXmlTag(batteryBlock, 'Id') || 'ACPI-BAT0'
    const manufacturer = extractXmlTag(batteryBlock, 'Manufacturer') || 'Standard ACPI'
    const chemistry = extractXmlTag(batteryBlock, 'Chemistry') || 'LION'
    const designCapacity = Number(extractXmlTag(batteryBlock, 'DesignCapacity')) || 42920
    const fullChargeCapacity = Number(extractXmlTag(batteryBlock, 'FullChargeCapacity')) || designCapacity
    const cycleCount = Number(extractXmlTag(batteryBlock, 'CycleCount')) || 0

    // Find latest <UsageEntry ... /> inside <RecentUsage> for live ChargeCapacity & AC status
    const recentUsageBlock = /<RecentUsage>([\s\S]*?)<\/RecentUsage>/i.exec(xml)?.[1] || ''
    const usageEntries = [...recentUsageBlock.matchAll(/<UsageEntry\b[^>]*\/?>/gi)]
    const lastEntry = usageEntries.length > 0 ? usageEntries[usageEntries.length - 1][0] : ''
    const currentCapacity = Number(extractXmlAttr(lastEntry, 'ChargeCapacity')) || fullChargeCapacity
    const acOnline = extractXmlAttr(lastEntry, 'Ac') === '1'
    const isCharging = acOnline && currentCapacity < fullChargeCapacity

    return {
      platform: 'windows',
      batteryId,
      manufacturer,
      chemistry,
      systemProductName,
      designCapacity,
      fullChargeCapacity,
      currentCapacity,
      cycleCount,
      acOnline,
      isCharging,
      temperatureCelsius: acOnline ? 34.2 : 30.5,
    }
  } catch {
    return null
  } finally {
    try {
      if (fs.existsSync(xmlPath)) fs.unlinkSync(xmlPath)
    } catch {
      // ignore cleanup error
    }
  }
}

function queryMacosHostBattery(): MacosHostBatteryPayload | null {
  if (process.platform !== 'darwin') return null

  try {
    const out = execFileSync('ioreg', ['-rn', 'AppleSmartBattery'], {
      encoding: 'utf8',
      timeout: 3000,
    })

    const getNum = (key: string, fallback: number): number => {
      const m = new RegExp(`"${key}"\\s*=\\s*(-?\\d+)`, 'i').exec(out)
      return m ? Number(m[1]) : fallback
    }
    const getBool = (key: string, fallback: boolean): boolean => {
      const m = new RegExp(`"${key}"\\s*=\\s*(Yes|No|true|false)`, 'i').exec(out)
      if (!m) return fallback
      return /^yes|true$/i.test(m[1])
    }
    const getStr = (key: string, fallback: string): string => {
      const m = new RegExp(`"${key}"\\s*=\\s*"([^"]*)"`, 'i').exec(out)
      return m ? m[1].trim() : fallback
    }

    const cycleCount = getNum('CycleCount', 0)
    const designCapacity = getNum('DesignCapacity', 5000)
    const maxCapacity = getNum('AppleRawMaxCapacity', getNum('NominalChargeCapacity', getNum('MaxCapacity', designCapacity)))
    const currentCapacity = getNum('AppleRawCurrentCapacity', getNum('CurrentCapacity', maxCapacity))
    const isCharging = getBool('IsCharging', false)
    const acOnline = getBool('ExternalConnected', isCharging)
    const tempRaw = getNum('Temperature', 3000)
    // IOKit AppleSmartBattery Temperature is typically in centi-Kelvin (e.g. 3031 -> 30.0°C) or centi-Celsius
    const temperatureCelsius =
      tempRaw > 2000 ? Math.round(((tempRaw / 100) - 273.15) * 10) / 10 : Math.round((tempRaw / 10) * 10) / 10

    let deviceModel = 'Mac'
    try {
      deviceModel = execFileSync('sysctl', ['-n', 'hw.model'], { encoding: 'utf8', timeout: 1500 }).trim() || 'Mac'
    } catch {
      // ignore
    }

    const batteryModel = getStr('DeviceName', 'AppleSmartBattery')

    return {
      platform: 'macos',
      deviceModel,
      batteryModel,
      designCapacity,
      maxCapacity,
      currentCapacity,
      cycleCount,
      acOnline,
      isCharging,
      temperatureCelsius,
    }
  } catch {
    return null
  }
}

function geaHostBatteryFfiPlugin(): Plugin {
  const hostPlatform = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macos' : 'unsupported'

  return {
    name: 'gea-host-battery-ffi-bridge',
    transform(code, id) {
      const cleanId = id.split('?')[0].replace(/\\/g, '/')
      if (!cleanId.endsWith('/src/battery-service.ts')) return null
      if (hostPlatform !== 'windows' && hostPlatform !== 'macos') return null

      const initialWin = hostPlatform === 'windows' ? queryWindowsHostBattery() : null
      const initialMac = hostPlatform === 'macos' ? queryMacosHostBattery() : null

      const bridgeInjection = `
configureBatteryHostBridge({
  platform: ${JSON.stringify(hostPlatform)},
  getWindowsPayload: () => {
    let cached = ${JSON.stringify(initialWin)};
    try {
      if (typeof XMLHttpRequest !== 'undefined') {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', '/__gea_ffi_windows_battery', false);
        xhr.send(null);
        if (xhr.status === 200 && xhr.responseText) {
          const parsed = JSON.parse(xhr.responseText);
          if (parsed && typeof parsed === 'object') cached = parsed;
        }
      }
    } catch {}
    return cached;
  },
  getMacosPayload: () => {
    let cached = ${JSON.stringify(initialMac)};
    try {
      if (typeof XMLHttpRequest !== 'undefined') {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', '/__gea_ffi_macos_battery', false);
        xhr.send(null);
        if (xhr.status === 200 && xhr.responseText) {
          const parsed = JSON.parse(xhr.responseText);
          if (parsed && typeof parsed === 'object') cached = parsed;
        }
      }
    } catch {}
    return cached;
  },
});
`
      return {
        code: `${code}\n${bridgeInjection}`,
        map: null,
      }
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url || '').split('?')[0]
        if (url === '/__gea_ffi_windows_battery') {
          if (hostPlatform !== 'windows') {
            res.statusCode = 403
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'Windows FFI is only available on Windows hosts.' }))
            return
          }
          const payload = queryWindowsHostBattery()
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Cache-Control', 'no-store')
          res.end(JSON.stringify(payload))
          return
        }

        if (url === '/__gea_ffi_macos_battery') {
          if (hostPlatform !== 'macos') {
            res.statusCode = 403
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'macOS FFI is only available on macOS hosts.' }))
            return
          }
          const payload = queryMacosHostBattery()
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Cache-Control', 'no-store')
          res.end(JSON.stringify(payload))
          return
        }

        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [geaHostBatteryFfiPlugin()],
})
