import { computed, ref } from 'vue'
import { geoApi } from '@/api/geo.api'
import type { Viewport, ViewportSummary } from '@/types/geo'

export function useMapViewport() {
  const viewport = ref<Viewport | null>(null)
  const summary = ref<ViewportSummary | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  let requestSequence = 0

  const center = computed(() => summary.value?.center ?? null)

  async function updateViewport(nextViewport: Viewport) {
    const requestId = ++requestSequence
    viewport.value = nextViewport
    loading.value = true
    error.value = null
    try {
      const result = await geoApi.summarizeViewport(nextViewport)
      if (requestId !== requestSequence) return
      summary.value = result
    } catch (cause) {
      if (requestId !== requestSequence) return
      error.value = cause instanceof Error ? cause.message : '지도 범위를 확인하지 못했습니다.'
    } finally {
      if (requestId === requestSequence) loading.value = false
    }
  }

  return { viewport, summary, center, loading, error, updateViewport }
}
