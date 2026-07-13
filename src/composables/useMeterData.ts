import { ref } from 'vue'

export interface MeterData {
  flg: number
  tim: string
  pac: number
  itd: number
  otd: number
  iet: number
  oet: number
  mod: number
  enb: number
}

const endpoint = '/api/meter'

export function useMeterData() {
  const meterData = ref<MeterData | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function refresh() {
    loading.value = true
    error.value = null

    try {
      const response = await fetch(endpoint)

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`)
      }

      const payload = await response.json() as MeterData
      meterData.value = payload
    } catch (err) {
      error.value = 'Die Zählerdaten konnten nicht geladen werden.'
      console.error(err)
    } finally {
      loading.value = false
    }
  }

  return {
    meterData,
    loading,
    error,
    refresh
  }
}
