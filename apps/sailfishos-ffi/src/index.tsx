import { ReactiveComponent, mount } from '@geastack/core'
import { readSailfishDemo, type SailfishDemoSnapshot } from './device-demo.js'
import './styles.css'

export class App extends ReactiveComponent {
  snapshot: SailfishDemoSnapshot = readSailfishDemo()

  refresh() {
    this.snapshot = readSailfishDemo()
  }

  template() {
    const snap = this.snapshot
    const ffi = snap.ffi
    const ffiValue = ffi.ok ? `${ffi.pid}` : 'yok'
    const ffiUnit = ffi.ok ? 'pid' : ''
    const ffiDetail = ffi.ok
      ? `strlen("${ffi.sample}") = ${ffi.strlen}`
      : ffi.error
    const libcLabel = snap.harbour.libc ? 'izinli' : 'listede yok'
    const libmLabel = snap.harbour.libm ? 'izinli' : 'listede yok'
    const unknownLabel = snap.harbour.unknown ? 'izinli' : 'listede yok'

    return (
      <div class="app">
        <div class="window">
          <div class="header">
            <div class="title-group">
              <span class="eyebrow">GEASTACK • LINUX / SAILFISHOS</span>
              <h1 class="title">Sailfish FFI</h1>
              <span class="device-meta">harbour-geaffi • com.geastack</span>
            </div>
            <button class="refresh-btn" onClick={() => this.refresh()}>
              <span class="refresh-btn-text">Yenile</span>
            </button>
          </div>

          <div class="card highlight">
            <span class="card-label">LIBC.SO.6</span>
            <div class="metric-row">
              <span class="metric-val">{ffiValue}</span>
              <span class="metric-unit">{ffiUnit}</span>
            </div>
            <span class="card-sub">{ffiDetail}</span>
          </div>

          <div class="card">
            <span class="card-label">SAILJAIL DESKTOP</span>
            <p class="block">{snap.desktop}</p>
          </div>

          <div class="card">
            <span class="card-label">UYGULAMA YOLLARI</span>
            <p class="path">{snap.paths.dataDir}</p>
            <p class="path">{snap.paths.configDir}</p>
            <p class="path">{snap.paths.cacheDir}</p>
            <p class="path">{snap.paths.packageShareDir}</p>
          </div>

          <div class="card">
            <span class="card-label">HARBOUR KÜTÜPHANELERİ</span>
            <p class="path">libc.so.6 · {libcLabel}</p>
            <p class="path">libm.so.6 · {libmLabel}</p>
            <p class="path">libnot-harbour.so.0 · {unknownLabel}</p>
          </div>

          <div class="footer">
            <span class="footer-text">Köprü: @geastack/ffi • hedef: sailfishos</span>
          </div>
        </div>
      </div>
    )
  }
}

mount(App)
