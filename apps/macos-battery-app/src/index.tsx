import { ReactiveComponent, mount } from '@geastack/core'
import { BatteryPlatform, BatteryService, BatteryStatus } from './battery-service.js'
import './styles.css'

export class App extends ReactiveComponent {
  hostPlatform: BatteryPlatform = BatteryService.detectDefaultPlatform()
  battery: BatteryStatus = BatteryService.getBatteryStatus(this.hostPlatform)
  lastUpdated: string = new Date().toLocaleTimeString()

  refresh() {
    this.battery = BatteryService.getBatteryStatus(this.hostPlatform)
    this.lastUpdated = new Date().toLocaleTimeString()
  }

  template() {
    const b = this.battery
    const percentage = Math.round((b.currentCapacity / b.maxCapacity) * 100)
    const isWin = b.platform === 'windows'
    const eyebrowText = `GEASTACK FFI ENGINE • ${isWin ? 'WINDOWS (WIN32 / POWRPROF)' : 'MACOS (IOKIT / OBJC)'}`
    const deviceMetaText = `${b.deviceModel} • ${b.batteryModel}`
    const tabLabel = isWin ? 'Windows FFI' : 'macOS FFI'
    const cycleText = `${b.cycleCount}`
    const cycleSubText = isWin
      ? 'WinRegistry / ACPI BatteryCycleCount FFI ile okundu'
      : 'IOKit / AppleSmartBattery FFI ile okundu'
    const healthValText = `${b.healthPercent}%`
    const capacitySubText = `Tam Dolum: ${b.maxCapacity} ${b.capacityUnit} (Tasarım: ${b.designCapacity} ${b.capacityUnit})`
    const chargeValText = `${percentage}%`
    const chargeUnitText = `${b.currentCapacity} ${b.capacityUnit}`
    const tempValText = `${b.temperatureCelsius}°C`
    const chargingSubText = `Durum: ${b.isCharging ? 'Şarj Oluyor' : 'Pilden Çalışıyor'}`
    const bridgeLabel = isWin ? '@geastack/ffi/windows' : '@geastack/ffi/apple'
    const footerText = `Köprü: ${bridgeLabel} (${b.backendLabel}) • Son Güncelleme: ${this.lastUpdated}`

    return (
      <div class="app">
        <div class="window">
          {/* Header */}
          <div class="header">
            <div class="title-group">
              <span class="eyebrow">{eyebrowText}</span>
              <h1 class="title">Battery Inspector</h1>
              <span class="device-meta">{deviceMetaText}</span>
            </div>
            <div class="header-actions">
              <div class="platform-tabs">
                <div class="tab-btn active">
                  <span class="tab-btn-text">{tabLabel}</span>
                </div>
              </div>
              <button class="refresh-btn" onClick={() => this.refresh()}>
                <span class="refresh-btn-text">Yenile</span>
              </button>
            </div>
          </div>

          {/* Main Metric Cards */}
          <div class="grid">
            {/* Cycle Count Card */}
            <div class="card highlight">
              <span class="card-label">PİL DÖNGÜSÜ (CYCLE COUNT)</span>
              <div class="metric-row">
                <span class="metric-val">{cycleText}</span>
                <span class="metric-unit">döngü</span>
              </div>
              <span class="card-sub">{cycleSubText}</span>
            </div>

            {/* Health Card */}
            <div class="card">
              <span class="card-label">PİL SAĞLIĞI & DURUM</span>
              <div class="metric-row">
                <span class="metric-val">{healthValText}</span>
                <div class="badge">
                  <span class="badge-text">{b.condition}</span>
                </div>
              </div>
              <span class="card-sub">{capacitySubText}</span>
            </div>

            {/* Charge Level Card */}
            <div class="card">
              <span class="card-label">ŞARJ SEVİYESİ</span>
              <div class="metric-row">
                <span class="metric-val">{chargeValText}</span>
                <span class="metric-unit">{chargeUnitText}</span>
              </div>
              <div class="progress-bar-bg">
                <div class="progress-bar-fill" style={{ width: `${percentage}%` }}></div>
              </div>
            </div>

            {/* Power & Temp */}
            <div class="card">
              <span class="card-label">GÜÇ KAYNAĞI & SICAKLIK</span>
              <div class="metric-row">
                <span class="metric-val">{tempValText}</span>
                <span class="metric-unit">{b.powerSource}</span>
              </div>
              <span class="card-sub">{chargingSubText}</span>
            </div>
          </div>

          {/* Footer Info */}
          <div class="footer">
            <span class="footer-text">{footerText}</span>
          </div>
        </div>
      </div>
    )
  }
}

mount(App)
