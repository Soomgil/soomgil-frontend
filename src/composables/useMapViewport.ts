import { computed, getCurrentScope, onScopeDispose, ref } from 'vue'
import { geoApi } from '@/api/geo.api'
import type { Viewport, ViewportSummary } from '@/types/geo'

const VIEWPORT_DEBOUNCE_MS = 250

export function useMapViewport() {
  const viewport = ref<Viewport | null>(null)
  const summary = ref<ViewportSummary | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  let requestSequence = 0
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let abortController: AbortController | null = null

  const center = computed(() => summary.value?.center ?? null)

  function clearDebounce() {
    if (debounceTimer === null) return
    clearTimeout(debounceTimer)
    debounceTimer = null
  }

  async function requestSummary(nextViewport: Viewport, requestId: number) {
    const controller = new AbortController()
    abortController = controller

    try {
      const result = await geoApi.summarizeViewport(nextViewport, controller.signal)
      if (requestId !== requestSequence || controller.signal.aborted) return
      summary.value = result
    } catch {
      if (requestId !== requestSequence || controller.signal.aborted) return
      error.value = '지도 범위를 동기화하지 못했습니다.'
    } finally {
      if (abortController === controller) abortController = null
      if (requestId === requestSequence) loading.value = false
    }
  }

  function prepareRequest(nextViewport: Viewport) {
    const requestId = ++requestSequence
    clearDebounce()
    abortController?.abort()
    abortController = null
    viewport.value = nextViewport
    summary.value = null
    loading.value = true
    error.value = null
    return requestId
  }

  function updateViewport(nextViewport: Viewport) {
    const requestId = prepareRequest(nextViewport)
    debounceTimer = setTimeout(() => {
      debounceTimer = null
      void requestSummary(nextViewport, requestId)
    }, VIEWPORT_DEBOUNCE_MS)
  }

  function retry() {
    if (!viewport.value || loading.value) return
    const nextViewport = viewport.value
    const requestId = prepareRequest(nextViewport)
    void requestSummary(nextViewport, requestId)
  }

  function dispose() {
    requestSequence += 1
    clearDebounce()
    abortController?.abort()
    abortController = null
    loading.value = false
  }

  if (getCurrentScope()) onScopeDispose(dispose)

  return { viewport, summary, center, loading, error, updateViewport, retry }
}
