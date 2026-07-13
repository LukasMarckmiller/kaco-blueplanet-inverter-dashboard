import os from 'node:os'
import { request as httpRequest } from 'node:http'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueRouter from 'vue-router/vite'
import vueLayouts from 'vite-plugin-vue-layouts'
import ui from '@nuxt/ui/vite'

function getCandidateHosts() {
  const interfaces = os.networkInterfaces()
  const hosts = new Set<string>()

  for (const values of Object.values(interfaces)) {
    for (const detail of values ?? []) {
      if (detail.family !== 'IPv4' || detail.internal) {
        continue
      }

      const octets = detail.address.split('.').slice(0, 3)
      for (let i = 1; i <= 254; i++) {
        hosts.add(`${octets.join('.')}.${i}`)
      }

      break
    }
  }

  return Array.from(hosts)
}

function requestHost(host: string, path: string) {
  return new Promise<{ host: string, ok: boolean, statusCode?: number, body?: string }>((resolve) => {
    const req = httpRequest({
      hostname: host,
      port: 8484,
      path,
      method: 'GET',
      timeout: 500,
      headers: {
        'Accept-Encoding': 'gzip, deflate, br',
        'User-Agent': 'okhttp/3.12.0',
        Connection: 'keep-alive'
      }
    }, (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => {
        body += chunk
      })
      res.on('end', () => {
        resolve({ host, ok: res.statusCode === 200, statusCode: res.statusCode, body })
      })
    })

    req.on('timeout', () => {
      req.destroy()
      resolve({ host, ok: false })
    })

    req.on('error', () => {
      resolve({ host, ok: false })
    })

    req.end()
  })
}

let cachedHost: string | null = null
let cachedSerialNumber: string | null = null

async function tryDiscoverFromCandidates() {
  const hostCandidates = getCandidateHosts()

  for (const host of hostCandidates) {
    const discovery = await requestHost(host, '/getdev.cgi')
    if (!discovery.ok) {
      continue
    }

    const deviceInfo = await requestHost(host, '/getdev.cgi?device=2')
    if (!deviceInfo.ok || !deviceInfo.body) {
      continue
    }

    try {
      const parsedInfo = JSON.parse(deviceInfo.body) as { inv?: Array<{ isn?: string }> }
      const serialNumber = parsedInfo.inv?.[0]?.isn

      if (!serialNumber) {
        continue
      }

      const deviceData = await requestHost(host, `/getdevdata.cgi?device=2&sn=${encodeURIComponent(serialNumber)}`)
      if (!deviceData.ok || !deviceData.body) {
        continue
      }

      const parsedData = JSON.parse(deviceData.body)
      cachedHost = host
      cachedSerialNumber = serialNumber

      return {
        data: parsedData,
        source: 'live' as const,
        host,
        status: 'online' as const
      }
    } catch {
      continue
    }
  }

  return null
}

async function discoverInverterData() {
  if (cachedHost && cachedSerialNumber) {
    const deviceData = await requestHost(cachedHost, `/getdevdata.cgi?device=2&sn=${encodeURIComponent(cachedSerialNumber)}`)
    if (deviceData.ok && deviceData.body) {
      try {
        const parsedData = JSON.parse(deviceData.body)
        return {
          data: parsedData,
          source: 'live' as const,
          host: cachedHost,
          status: 'online' as const
        }
      } catch {
        cachedHost = null
        cachedSerialNumber = null
      }
    } else {
      cachedHost = null
      cachedSerialNumber = null
    }
  }

  const discovered = await tryDiscoverFromCandidates()
  if (discovered) {
    return discovered
  }

  const now = new Date()
  const isEveningFallback = now.getHours() >= 21 || now.getHours() < 6

  return {
    data: {
      flg: 0,
      tim: now.toISOString().replace(/[-:T.]/g, '').slice(0, 14),
      tmp: 0,
      fac: 0,
      pac: 0,
      sac: 0,
      qac: 0,
      eto: 0,
      etd: 0,
      hto: 0,
      pf: 0,
      wan: 0,
      err: 0,
      vac: [0, 0, 0],
      iac: [0, 0, 0],
      vpv: [0, 0],
      ipv: [0, 0],
      str: []
    },
    source: 'fallback' as const,
    status: 'fallback' as const,
    fallbackReason: isEveningFallback
      ? 'Kein Wechselrichter im Netzwerk gefunden. Die PV-Anlage ist derzeit wahrscheinlich offline oder es ist Nacht.'
      : 'Kein Wechselrichter im Netzwerk gefunden. Die Beispielwerte werden angezeigt.'
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vueRouter({
      dts: 'src/route-map.d.ts'
    }),
    vueLayouts(),
    vue(),
    ui({
      ui: {
        colors: {
          primary: 'orange',
          neutral: 'zinc'
        }
      }
    }),
    {
      name: 'inverter-discovery',
      configureServer(server) {
        server.middlewares.use('/api/inverter', async (_req, res) => {
          const payload = await discoverInverterData()
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(payload))
        })
      }
    }
  ]
})
