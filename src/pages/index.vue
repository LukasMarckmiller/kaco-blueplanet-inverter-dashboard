<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useDashboard } from '../composables/useDashboard'

interface InverterData {
  flg: number
  tim: string
  tmp: number
  fac: number
  pac: number
  sac: number
  qac: number
  eto: number
  etd: number
  hto: number
  pf: number
  wan: number
  err: number
  vac: number[]
  iac: number[]
  vpv: number[]
  ipv: number[]
  str: string[]
}

interface HistoryPoint {
  id: string
  timestamp: string
  source: 'live' | 'fallback'
  host?: string
  power: number
  temperature: number
  frequency: number
  totalEnergy: number
  dailyEnergy: number
  vpv1: number
  vpv2: number
  ipv1: number
  ipv2: number
}

interface DiscoveryResponse {
  data: InverterData
  source: 'live' | 'fallback'
  host?: string
  status?: 'discovering' | 'online' | 'offline' | 'fallback'
  fallbackReason?: string
}

const { isNotificationsSlideoverOpen } = useDashboard()

const endpoint = '/api/inverter'
const fallbackData: InverterData = {
  flg: 1,
  tim: '20260712193846',
  tmp: 430,
  fac: 4999,
  pac: 0,
  sac: 0,
  qac: 0,
  eto: 176403,
  etd: 200,
  hto: 11819,
  pf: 0,
  wan: 0,
  err: 0,
  vac: [2380, 2362, 2364],
  iac: [5, 5, 5],
  vpv: [1503, 1497],
  ipv: [0, 0],
  str: []
}

const inverterData = ref<InverterData | null>(fallbackData)
const loading = ref(false)
const discoveryStatus = ref('Warte auf Initialisierung...')
const deviceStatus = ref<'discovering' | 'online' | 'offline' | 'fallback'>('discovering')
const errorMessage = ref<string | null>(null)
const history = ref<HistoryPoint[]>([])
const selectedChartParameter = ref('power')
const chartParameterOptions = [{
  label: 'Leistung AC',
  value: 'power'
}, {
  label: 'Temperatur',
  value: 'temperature'
}, {
  label: 'Frequenz',
  value: 'frequency'
}, {
  label: 'Gesamtenergie',
  value: 'totalEnergy'
}, {
  label: 'Tagesenergie',
  value: 'dailyEnergy'
}, {
  label: 'PV1 Spannung',
  value: 'vpv1'
}, {
  label: 'PV2 Spannung',
  value: 'vpv2'
}, {
  label: 'PV1 Strom',
  value: 'ipv1'
}, {
  label: 'PV2 Strom',
  value: 'ipv2'
}]

let refreshTimer: ReturnType<typeof setInterval> | null = null
let dbPromise: Promise<IDBDatabase> | null = null

const statusLabel = computed(() => {
  switch (deviceStatus.value) {
    case 'online':
      return 'Online / Aktiv'
    case 'offline':
      return 'Offline'
    case 'discovering':
      return 'Suche'
    default:
      return 'Fallback'
  }
})

const statusColor = computed(() => {
  switch (deviceStatus.value) {
    case 'online':
      return 'success'
    case 'offline':
      return 'warning'
    case 'discovering':
      return 'neutral'
    default:
      return 'warning'
  }
})

const discoveryBadgeLabel = computed(() => {
  switch (deviceStatus.value) {
    case 'online':
      return 'Aktiv'
    case 'offline':
      return 'Offline'
    case 'discovering':
      return 'In Bearbeitung'
    default:
      return 'Fallback'
  }
})

const discoveryBadgeColor = computed(() => {
  switch (deviceStatus.value) {
    case 'online':
      return 'success'
    case 'offline':
      return 'warning'
    case 'discovering':
      return 'primary'
    default:
      return 'warning'
  }
})
const timestampLabel = computed(() => formatTimestamp(inverterData.value?.tim ?? ''))
const temperatureLabel = computed(() => `${formatValue(inverterData.value?.tmp ?? 0, 10, 1)} °C`)
const frequencyLabel = computed(() => `${formatValue(inverterData.value?.fac ?? 0, 100, 2)} Hz`)
const totalEnergyLabel = computed(() => `${formatValue(inverterData.value?.eto ?? 0, 100, 2)} kWh`)
const dailyEnergyLabel = computed(() => `${formatValue(inverterData.value?.etd ?? 0, 10, 2)} kWh`)
const powerLabel = computed(() => `${(inverterData.value?.pac ?? 0).toLocaleString('de-DE')} W`)
const apparentPowerLabel = computed(() => `${(inverterData.value?.sac ?? 0).toLocaleString('de-DE')} VA`)
const reactivePowerLabel = computed(() => `${(inverterData.value?.qac ?? 0).toLocaleString('de-DE')} var`)
const operatingHoursLabel = computed(() => `${inverterData.value?.hto ?? 0} h`)
const warningsLabel = computed(() => `${inverterData.value?.wan ?? 0} Warnungen`)
const errorsLabel = computed(() => `${inverterData.value?.err ?? 0} Fehler`)

const summaryItems = computed(() => [{
  label: 'Leistung',
  value: powerLabel.value,
  caption: 'Aktuelle AC-Ausgabe'
}, {
  label: 'Temperatur',
  value: temperatureLabel.value,
  caption: 'Wechselrichter-Temperatur'
}, {
  label: 'Netzfrequenz',
  value: frequencyLabel.value,
  caption: 'Aktuelle Systemfrequenz'
}, {
  label: 'Gesamtenergie',
  value: totalEnergyLabel.value,
  caption: 'Kumulierte Energie'
}])

const detailItems = computed(() => [{
  label: 'Tagesenergie',
  value: dailyEnergyLabel.value
}, {
  label: 'Betriebsstunden',
  value: operatingHoursLabel.value
}, {
  label: 'Scheinleistung',
  value: apparentPowerLabel.value
}, {
  label: 'Blindleistung',
  value: reactivePowerLabel.value
}])

const phaseItems = computed(() => {
  const vac = inverterData.value?.vac ?? []
  const iac = inverterData.value?.iac ?? []
  const length = Math.max(vac.length, iac.length, 1)

  return Array.from({ length }, (_, index) => {
    const voltage = (vac[index] ?? 0) / 10
    const current = (iac[index] ?? 0) / 10
    const power = voltage * current

    return {
      label: `Phase ${index + 1}`,
      voltage: `${voltage.toFixed(1)} V`,
      current: `${current.toFixed(1)} A`,
      power: `${power.toFixed(1)} W`
    }
  })
})

const pvItems = computed(() => {
  const vpv = inverterData.value?.vpv ?? []
  const ipv = inverterData.value?.ipv ?? []
  const length = Math.max(vpv.length, ipv.length, 1)

  return Array.from({ length }, (_, index) => {
    const voltage = (vpv[index] ?? 0) / 10
    const current = (ipv[index] ?? 0) / 100
    const power = voltage * current

    return {
      label: `PV Element ${index + 1}`,
      voltage: `${voltage.toFixed(1)} V`,
      current: `${current.toFixed(1)} A`,
      power: `${power.toFixed(1)} W`
    }
  })
})

const totalPvPower = computed(() => pvItems.value.reduce((sum, item) => sum + Number(item.power.replace(' W', '')), 0))
const currentPowerValue = computed(() => inverterData.value?.pac ?? 0)
const sunMode = computed(() => {
  const power = currentPowerValue.value

  if (power <= 0) {
    return 'moon'
  }

  if (power < 200) {
    return 'low'
  }

  if (power < 600) {
    return 'medium'
  }

  return 'full'
})
const selectedParameterLabel = computed(() => chartParameterOptions.find((option) => option.value === selectedChartParameter.value)?.label ?? 'Leistung AC')
const chartValue = computed(() => {
  if (!history.value.length) {
    return 'Keine Daten'
  }

  const latest = history.value.at(-1)
  if (!latest) {
    return 'Keine Daten'
  }

  return formatMetricValue(latest, selectedChartParameter.value)
})

const chartYUnitLabel = computed(() => {
  switch (selectedChartParameter.value) {
    case 'temperature':
      return '°C'
    case 'frequency':
      return 'Hz'
    case 'totalEnergy':
    case 'dailyEnergy':
      return 'Wh'
    case 'vpv1':
    case 'vpv2':
      return 'V'
    case 'ipv1':
    case 'ipv2':
      return 'A'
    default:
      return 'W'
  }
})

const chartXScaleLabels = computed(() => {
  if (!history.value.length) {
    return []
  }

  const points = history.value
  const count = Math.min(4, points.length)

  return Array.from({ length: count }, (_, index) => {
    const targetIndex = count === 1
      ? 0
      : Math.round((index / (count - 1)) * (points.length - 1))

    const point = points[targetIndex]
    const date = new Date(point.timestamp)

    return {
      label: date.toLocaleTimeString('de-DE', {
        hour: '2-digit',
        minute: '2-digit'
      }),
      x: count === 1 ? 50 : (index / (count - 1)) * 100
    }
  })
})

const chartPath = computed(() => {
  if (!history.value.length) {
    return ''
  }

  const values = history.value.map((item) => getMetricValue(item, selectedChartParameter.value))
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1

  return values.map((value, index) => {
    const x = history.value.length === 1 ? 50 : (index / (values.length - 1)) * 100
    const y = 100 - ((value - min) / range) * 80 - 10
    return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
  }).join(' ')
})

function openDatabase() {
  if (dbPromise) {
    return dbPromise
  }

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('inverter-monitor-db', 1)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('samples')) {
        db.createObjectStore('samples', { keyPath: 'id' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

  return dbPromise
}

async function loadHistoryFromDatabase() {
  try {
    const db = await openDatabase()
    const transaction = db.transaction('samples', 'readonly')
    const store = transaction.objectStore('samples')

    const records = await new Promise<HistoryPoint[]>((resolve, reject) => {
      const request = store.getAll()
      request.onsuccess = () => resolve(request.result as HistoryPoint[])
      request.onerror = () => reject(request.error)
    })

    history.value = records.sort((a, b) => a.timestamp.localeCompare(b.timestamp)).slice(-60)
  } catch (error) {
    console.error(error)
  }
}

async function persistHistoryPoint(point: HistoryPoint) {
  try {
    const db = await openDatabase()
    const transaction = db.transaction('samples', 'readwrite')
    const store = transaction.objectStore('samples')

    await new Promise<void>((resolve, reject) => {
      store.put(point)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
  } catch (error) {
    console.error(error)
  }
}

function createHistoryPoint(data: InverterData, source: 'live' | 'fallback', host?: string) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    source,
    host,
    power: data.pac ?? 0,
    temperature: data.tmp ?? 0,
    frequency: data.fac ?? 0,
    totalEnergy: data.eto ?? 0,
    dailyEnergy: data.etd ?? 0,
    vpv1: data.vpv?.[0] ?? 0,
    vpv2: data.vpv?.[1] ?? 0,
    ipv1: data.ipv?.[0] ?? 0,
    ipv2: data.ipv?.[1] ?? 0
  } satisfies HistoryPoint
}

function getMetricValue(item: HistoryPoint, metric: string) {
  switch (metric) {
    case 'temperature':
      return item.temperature
    case 'frequency':
      return item.frequency
    case 'totalEnergy':
      return item.totalEnergy
    case 'dailyEnergy':
      return item.dailyEnergy
    case 'vpv1':
      return item.vpv1
    case 'vpv2':
      return item.vpv2
    case 'ipv1':
      return item.ipv1
    case 'ipv2':
      return item.ipv2
    default:
      return item.power
  }
}

function formatMetricValue(item: HistoryPoint, metric: string) {
  const value = getMetricValue(item, metric)

  switch (metric) {
    case 'temperature':
      return `${(value / 10).toFixed(1)} °C`
    case 'frequency':
      return `${(value / 100).toFixed(2)} Hz`
    case 'totalEnergy':
    case 'dailyEnergy':
      return `${value.toLocaleString('de-DE')} Wh`
    case 'vpv1':
    case 'vpv2':
      return `${(value / 10).toFixed(1)} V`
    case 'ipv1':
    case 'ipv2':
      return `${value.toFixed(1)} A`
    default:
      return `${value.toLocaleString('de-DE')} W`
  }
}

async function refreshData() {
  loading.value = true
  errorMessage.value = null
  deviceStatus.value = 'discovering'
  discoveryStatus.value = 'Suche nach einem aktiven Wechselrichter im Netzwerk...'

  try {
    const response = await fetch(endpoint)

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`)
    }

    const payload = await response.json() as DiscoveryResponse
    const data = payload.data ?? fallbackData
    inverterData.value = data

    const point = createHistoryPoint(data, payload.source, payload.host)
    await persistHistoryPoint(point)
    history.value = [...history.value.filter((entry) => entry.id !== point.id), point].slice(-60)

    if (payload.source === 'fallback') {
      deviceStatus.value = payload.status === 'offline' ? 'offline' : 'fallback'
      discoveryStatus.value = payload.fallbackReason ?? 'Kein Wechselrichter gefunden. Fallback-Daten werden angezeigt.'
      errorMessage.value = payload.fallbackReason ?? 'Die Live-Daten konnten nicht geladen werden. Die Beispielwerte werden angezeigt.'
    } else {
      deviceStatus.value = payload.status ?? 'online'
      discoveryStatus.value = payload.host
        ? `Live-Daten von ${payload.host} geladen.`
        : 'Live-Daten geladen.'
    }
  } catch (error) {
    inverterData.value = fallbackData
    deviceStatus.value = 'offline'
    discoveryStatus.value = 'Die Live-Abfrage ist fehlgeschlagen. Neue Suche nach dem Wechselrichter wird gestartet.'
    errorMessage.value = 'Die Live-Daten konnten nicht geladen werden. Die Beispielwerte werden angezeigt.'
    console.error(error)
  } finally {
    loading.value = false
  }
}

function formatTimestamp(value: string) {
  if (!value || value.length < 14) {
    return 'Keine Zeitangabe'
  }

  const year = Number(value.slice(0, 4))
  const month = Number(value.slice(4, 6)) - 1
  const day = Number(value.slice(6, 8))
  const hour = Number(value.slice(8, 10))
  const minute = Number(value.slice(10, 12))
  const second = Number(value.slice(12, 14))

  return new Date(year, month, day, hour, minute, second).toLocaleString('de-DE', {
    dateStyle: 'medium',
    timeStyle: 'medium'
  })
}

function formatValue(value: number, divisor: number, digits: number) {
  return (value / divisor).toFixed(digits)
}

onMounted(async () => {
  await loadHistoryFromDatabase()
  await refreshData()

  refreshTimer = setInterval(() => {
    void refreshData()
  }, 10000)
})

onBeforeUnmount(() => {
  if (refreshTimer) {
    clearInterval(refreshTimer)
  }
})
</script>

<template>
  <UDashboardPanel id="home">
    <template #header>
      <UDashboardNavbar title="Wechselrichter-Dashboard" :ui="{ right: 'gap-3' }">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UTooltip text="Notifications" :shortcuts="['N']">
            <UButton
              color="neutral"
              variant="ghost"
              square
              @click="isNotificationsSlideoverOpen = true"
            >
              <UChip color="error" inset>
                <UIcon name="i-lucide-bell" class="size-5 shrink-0" />
              </UChip>
            </UButton>
          </UTooltip>

          <UButton
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="ghost"
            :loading="loading"
            @click="refreshData"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-6">
        <div v-if="deviceStatus === 'discovering' || deviceStatus === 'offline' || deviceStatus === 'fallback'" class="rounded-lg border border-default/70 bg-background/70 p-3 text-sm">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span class="font-medium">Discovery-Status</span>
            <UBadge :color="discoveryBadgeColor" variant="subtle">
              {{ discoveryBadgeLabel }}
            </UBadge>
          </div>
          <p class="mt-2 text-muted">
            {{ discoveryStatus }}
          </p>
        </div>

        <div class="rounded-2xl border border-default/70 bg-gradient-to-br from-background to-background/80 p-5 text-center">
          <div class="flex items-center justify-center gap-3">
            <span v-if="sunMode === 'moon'" class="text-5xl">🌙</span>
            <span v-else-if="sunMode === 'low'" class="text-5xl">🌤️</span>
            <span v-else-if="sunMode === 'medium'" class="text-5xl">☀️</span>
            <span v-else class="text-5xl">☀️☀️</span>
          </div>
          <p class="mt-3 text-sm font-medium text-muted">Aktuelle Leistung</p>
          <p class="mt-1 text-3xl font-semibold">{{ currentPowerValue.toLocaleString('de-DE') }} W</p>
          <p class="mt-2 text-sm text-muted">(PV-Ausgang)</p>
        </div>

        <div v-if="errorMessage" class="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
          {{ errorMessage }}
        </div>


        <UCard>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p class="text-sm font-medium text-muted">
                Phasen- und PV-Eingänge
              </p>
              <h3 class="mt-1 text-lg font-semibold">
                Spannungs-, Strom- und Leistungswerte
              </h3>
            </div>
            <UBadge color="neutral" variant="subtle">
              PV-Leistung: {{ totalPvPower.toFixed(1) }} W
            </UBadge>
          </div>

          <div class="mt-5 space-y-5">
            <div>
              <div class="mb-3 flex items-center gap-2">
                <UIcon name="i-lucide-sun" class="size-5 text-warning" />
                <h4 class="font-semibold">
                  PV-Eingänge
                </h4>
              </div>

              <div class="grid gap-3 md:grid-cols-2">
                <div
                  v-for="item in pvItems"
                  :key="item.label"
                  class="rounded-lg border border-default/70 bg-background/60 p-3"
                >
                  <p class="font-medium">
                    {{ item.label }}
                  </p>
                  <p class="mt-1 text-sm text-muted">
                    {{ item.voltage }}
                  </p>
                  <p class="mt-1 text-sm text-muted">
                    {{ item.current }}
                  </p>
                  <p class="mt-2 text-sm font-semibold text-warning">
                    {{ item.power }}
                  </p>
                </div>
              </div>

                          <div>
              <div class="mt-3 flex items-center gap-2">
                <UIcon name="i-lucide-zap" class="size-5 text-primary" />
                <h4 class="font-semibold">
                  AC-Phasen
                </h4>
              </div>

              <div class="grid gap-3 md:grid-cols-3">
                <div
                  v-for="item in phaseItems"
                  :key="item.label"
                  class="rounded-lg border border-default/70 bg-background/60 p-3"
                >
                  <p class="font-medium">
                    {{ item.label }}
                  </p>
                  <p class="mt-1 text-sm text-muted">
                    {{ item.voltage }}
                  </p>
                  <p class="mt-1 text-sm text-muted">
                    {{ item.current }}
                  </p>
                  <p class="mt-2 text-sm font-semibold text-primary">
                    {{ item.power }}
                  </p>
                </div>
              </div>
            </div>
              
            </div>
          </div>
        </UCard>

        <div class="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <UCard>
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p class="text-sm font-medium text-muted">
                  Status des Wechselrichters
                </p>
                <h2 class="mt-1 text-2xl font-semibold">
                  {{ statusLabel }}
                </h2>
              </div>

              <UBadge :color="statusColor" variant="subtle">
                {{ statusLabel }}
              </UBadge>
            </div>

            <div class="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div
                v-for="item in summaryItems"
                :key="item.label"
                class="rounded-xl border border-default/70 bg-background/70 p-4"
              >
                <p class="text-sm text-muted">
                  {{ item.label }}
                </p>
                <p class="mt-2 text-xl font-semibold">
                  {{ item.value }}
                </p>
                <p class="mt-1 text-xs text-muted">
                  {{ item.caption }}
                </p>
              </div>
            </div>
          </UCard>

          <UCard>
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="text-sm font-medium text-muted">
                  Letztes Update
                </p>
                <h3 class="mt-1 text-lg font-semibold">
                  {{ timestampLabel }}
                </h3>
              </div>

              <UIcon name="i-lucide-signal" class="size-6 text-primary" />
            </div>

            <div class="mt-5 space-y-3">
              <div
                v-for="item in detailItems"
                :key="item.label"
                class="flex items-center justify-between rounded-lg border border-default/70 px-3 py-2"
              >
                <span class="text-sm text-muted">
                  {{ item.label }}
                </span>
                <span class="font-medium">
                  {{ item.value }}
                </span>
              </div>
            </div>
          </UCard>
        </div>

        <div class="grid gap-4 lg:grid-cols-3">
          <UCard>
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-alert-triangle" class="size-5 text-warning" />
              <div>
                <p class="text-sm font-medium text-muted">
                  Warnungen
                </p>
                <p class="text-xl font-semibold">
                  {{ warningsLabel }}
                </p>
              </div>
            </div>
          </UCard>

          <UCard>
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-badge-x" class="size-5 text-error" />
              <div>
                <p class="text-sm font-medium text-muted">
                  Fehler
                </p>
                <p class="text-xl font-semibold">
                  {{ errorsLabel }}
                </p>
              </div>
            </div>
          </UCard>

          <UCard>
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-clock-3" class="size-5 text-primary" />
              <div>
                <p class="text-sm font-medium text-muted">
                  Betriebszeit
                </p>
                <p class="text-xl font-semibold">
                  {{ operatingHoursLabel }}
                </p>
              </div>
            </div>
          </UCard>
        </div>
        <UCard>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p class="text-sm font-medium text-muted">
                Historie
              </p>
              <h3 class="mt-1 text-lg font-semibold">
                Verlauf über Zeit
              </h3>
            </div>

            <div class="flex items-center gap-2">
              <label for="chart-param" class="text-sm text-muted">
                Parameter
              </label>
              <select
                id="chart-param"
                v-model="selectedChartParameter"
                class="rounded-md border border-default/70 bg-background px-3 py-2 text-sm"
              >
                <option v-for="option in chartParameterOptions" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
            </div>
          </div>

          <div class="mt-5 w-full max-w-none rounded-xl border border-default/70 bg-background/60 p-4 md:p-6">
            <div class="flex items-center justify-between gap-3 text-sm text-muted">
              <span>{{ selectedParameterLabel }}</span>
              <span class="font-semibold text-foreground">{{ chartValue }}</span>
            </div>

            <div class="mt-4 overflow-hidden rounded-lg border border-default/20 bg-background/40 p-2">
              <svg viewBox="0 0 100 100" class="h-72 w-full md:h-80">
                <line x1="0" y1="90" x2="100" y2="90" stroke="currentColor" stroke-opacity="0.2" />
                <line x1="0" y1="70" x2="100" y2="70" stroke="currentColor" stroke-opacity="0.15" />
                <line x1="0" y1="50" x2="100" y2="50" stroke="currentColor" stroke-opacity="0.15" />
                <line x1="0" y1="30" x2="100" y2="30" stroke="currentColor" stroke-opacity="0.15" />
                <line x1="0" y1="10" x2="100" y2="10" stroke="currentColor" stroke-opacity="0.15" />
                <path :d="chartPath" fill="none" stroke="currentColor" stroke-width="2" class="text-primary" />
                <text x="2" y="8" class="fill-muted text-[3px]">{{ chartYUnitLabel }}</text>
                <text v-for="tick in chartXScaleLabels" :key="tick.label" :x="tick.x" y="99" text-anchor="middle" class="fill-muted text-[3px]">{{ tick.label }}</text>
              </svg>
            </div>
          </div>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
