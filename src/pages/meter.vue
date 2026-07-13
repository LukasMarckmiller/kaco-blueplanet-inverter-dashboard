<script setup lang="ts">
import { computed } from 'vue'
import { useMeterData } from '../composables/useMeterData'

const { meterData, loading, error, refresh } = useMeterData()

const currentImportExportLabel = computed(() => {
  const value = meterData.value?.pac ?? 0
  return `${Math.abs(value).toLocaleString('de-DE')} W`
})

const direction = computed(() => {
  const value = meterData.value?.pac ?? 0
  if (value < 0) {
    return 'import'
  }

  if (value > 0) {
    return 'export'
  }

  return 'neutral'
})

const directionLabel = computed(() => {
  switch (direction.value) {
    case 'import':
      return 'Strom wird aus dem Netz bezogen'
    case 'export':
      return 'Strom wird ins Netz eingespeist'
    default:
      return 'Keine aktive Leistung'
  }
})

const directionIcon = computed(() => {
  switch (direction.value) {
    case 'import':
      return 'i-lucide-arrow-down-left'
    case 'export':
      return 'i-lucide-arrow-up-right'
    default:
      return 'i-lucide-minus'
  }
})

const directionColor = computed(() => {
  switch (direction.value) {
    case 'import':
      return 'error'
    case 'export':
      return 'success'
    default:
      return 'neutral'
  }
})

const importTodayLabel = computed(() => `${formatKwh(meterData.value?.itd ?? 0)} kWh`)
const exportTodayLabel = computed(() => `${formatKwh(meterData.value?.otd ?? 0)} kWh`)
const importTotalLabel = computed(() => `${formatKwh(meterData.value?.iet ?? 0)} kWh`)
const exportTotalLabel = computed(() => `${formatKwh(meterData.value?.oet ?? 0)} kWh`)

function formatKwh(value: number) {
  return (value / 1000).toFixed(2)
}
</script>

<template>
  <UDashboardPanel id="meter">
    <template #header>
      <UDashboardNavbar title="Einspeise- und Zählerstände" :ui="{ right: 'gap-3' }">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="ghost"
            :loading="loading"
            @click="refresh"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-6">
        <div class="rounded-2xl border border-default/70 bg-gradient-to-br from-background to-background/80 p-6">
          <div class="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p class="text-sm font-medium text-muted">Aktuelle Einspeiseleistung</p>
              <p class="mt-2 text-4xl font-semibold">{{ currentImportExportLabel }}</p>
            </div>

            <div class="flex items-center gap-3 rounded-full border border-default/70 px-4 py-2">
              <div class="relative flex size-10 items-center justify-center rounded-full border border-default/70 bg-background/70">
                <UIcon name="i-lucide-tower" class="size-5" :class="direction === 'import' ? 'text-error' : direction === 'export' ? 'text-success' : 'text-muted'" />
                <UIcon :name="directionIcon" class="absolute -bottom-1 -right-1 size-4 rounded-full bg-background" :class="direction === 'import' ? 'text-error' : direction === 'export' ? 'text-success' : 'text-muted'" />
              </div>
              <div>
                <p class="text-sm font-medium">{{ directionLabel }}</p>
                <UBadge :color="directionColor" variant="subtle">
                  {{ direction === 'import' ? 'Netzbezug' : direction === 'export' ? 'Einspeisung' : 'Neutral' }}
                </UBadge>
              </div>
            </div>
          </div>
        </div>

        <div v-if="error" class="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
          {{ error }}
        </div>

        <div class="grid gap-4 md:grid-cols-2">
          <UCard>
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-arrow-down-left" class="size-5 text-error" />
              <div>
                <p class="text-sm font-medium text-muted">Netzbezug</p>
                <p class="text-xl font-semibold">Heute</p>
              </div>
            </div>
            <p class="mt-4 text-2xl font-semibold">{{ importTodayLabel }}</p>
          </UCard>

          <UCard>
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-arrow-up-right" class="size-5 text-success" />
              <div>
                <p class="text-sm font-medium text-muted">Netzeinspeisung</p>
                <p class="text-xl font-semibold">Heute</p>
              </div>
            </div>
            <p class="mt-4 text-2xl font-semibold">{{ exportTodayLabel }}</p>
          </UCard>
        </div>

        <div class="grid gap-4 md:grid-cols-2">
          <UCard>
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-battery-charging" class="size-5 text-primary" />
              <div>
                <p class="text-sm font-medium text-muted">Gesamter Netzbezug</p>
                <p class="text-xl font-semibold">Gesamt</p>
              </div>
            </div>
            <p class="mt-4 text-2xl font-semibold">{{ importTotalLabel }}</p>
          </UCard>

          <UCard>
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-battery-full" class="size-5 text-primary" />
              <div>
                <p class="text-sm font-medium text-muted">Gesamte Netzeinspeisung</p>
                <p class="text-xl font-semibold">Gesamt</p>
              </div>
            </div>
            <p class="mt-4 text-2xl font-semibold">{{ exportTotalLabel }}</p>
          </UCard>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
