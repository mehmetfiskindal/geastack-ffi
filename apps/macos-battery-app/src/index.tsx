import { ReactiveComponent, mount } from '@geastack/core'
import { BatteryService, BatteryStatus } from './battery-service.js'
import './styles.css'

export class App extends ReactiveComponent {
  battery: BatteryStatus = BatteryService.getBatteryStatus()
  lastUpdated: string = new Date().toLocaleTimeString()

  refresh() {
    this.battery = BatteryService.getBatteryStatus()
    this.lastUpdated = new Date().toLocaleTimeString()
  }

  template() {
    const b = this.battery
    const percentage = Math.round((b.currentCapacity / b.maxCapacity) * 100)

    return (
      <div class="app">
        <div class="window">
          {/* Header */}
          <div class="header">
            <div class="title-group">
              <span class="eyebrow">GEASTACK FFI ENGINE • MACOS</span>
              <h1 class="title">Battery Inspector</h1>
            </div>
            <button class="refresh-btn" onClick={() => this.refresh()}>
              ↻ Yenile
            </button>
          </div>

          {/* Main Metric Cards */}
          <div class="grid">
            {/* Cycle Count Card */}
            <div class="card highlight">
              <span class="card-label">PIL DÖNGÜSÜ (CYCLE COUNT)</span>
              <div class="metric-row">
                <span class="metric-val">{b.cycleCount}</span>
                <span class="metric-unit">döngü</span>
              </div>
              <span class="card-sub">IOKit / AppleSmartBattery FFI ile okundu</span>
            </div>

            {/* Health Card */}
            <div class="card">
              <span class="card-label">PİL SAĞLIĞI & DURUM</span>
              <div class="metric-row">
                <span class="metric-val">{b.healthPercent}%</span>
                <span class="badge">{b.condition}</span>
              </div>
              <span class="card-sub">Maksimum Kapasite: {b.maxCapacity} mAh</span>
            </div>

            {/* Charge Level Card */}
            <div class="card">
              <span class="card-label">ŞARJ SEVİYESİ</span>
              <div class="metric-row">
                <span class="metric-val">{percentage}%</span>
                <span class="metric-unit">{b.currentCapacity} mAh</span>
              </div>
              <div class="progress-bar-bg">
                <div class="progress-bar-fill" style={{ width: `${percentage}%` }}></div>
              </div>
            </div>

            {/* Power & Temp */}
            <div class="card">
              <span class="card-label">GÜÇ KAYNAĞI & SICAKLIK</span>
              <div class="metric-row">
                <span class="metric-val">{b.temperatureCelsius}°C</span>
                <span class="metric-unit">{b.powerSource}</span>
              </div>
              <span class="card-sub">Durum: {b.isCharging ? 'Şarj Oluyor' : 'Pilden Çalışıyor'}</span>
            </div>
          </div>

          {/* Footer Info */}
          <div class="footer">
            <span class="footer-text">
              Bağlantı: <code>@geastack/ffi</code> • Son Güncelleme: {this.lastUpdated}
            </span>
          </div>
        </div>
      </div>
    )
  }
}

mount(App)
