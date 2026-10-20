import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import { readSailfishDemo } from './src/sailfish-probe.ts'

const snapshot = readSailfishDemo()
const virtualProbeId = '\0sailfish-probe-web'
const appDir = path.dirname(fileURLToPath(import.meta.url))

function sailfishWebSnapshot(): Plugin {
  return {
    name: 'sailfish-web-snapshot',
    enforce: 'pre',
    resolveId(source, importer, options) {
      if (options?.ssr || !importer) return null
      const normalized = source.replace(/\\/g, '/')
      if (
        normalized.endsWith('/sailfish-probe.js') ||
        normalized.endsWith('/sailfish-probe.ts') ||
        normalized.endsWith('/device-demo.js') ||
        normalized.endsWith('/device-demo.ts') ||
        normalized === './sailfish-probe.js' ||
        normalized === './device-demo.js'
      ) {
        return virtualProbeId
      }
      return null
    },
    load(id) {
      if (id !== virtualProbeId) return null
      return `export function readSailfishDemo() { return ${JSON.stringify(snapshot)}; }\n`
    },
  }
}

function domPreviewMount(): Plugin {
  return {
    name: 'sailfish-dom-preview',
    enforce: 'pre',
    transform(code, id) {
      const clean = id.split('?')[0].replace(/\\/g, '/')
      if (!clean.endsWith('/src/index.tsx')) return null
      return code.replace(
        "import { ReactiveComponent, mount } from '@geastack/core'",
        "import { ReactiveComponent } from '@geastack/core'\nimport { mount } from './dom-preview.ts'",
      )
    },
  }
}

export default defineConfig({
  root: appDir,
  esbuild: {
    jsxFactory: 'h',
    jsxFragment: 'Fragment',
    jsxInject: "import { h } from '/src/dom-preview.ts'",
  },
  plugins: [sailfishWebSnapshot(), domPreviewMount()],
})
