import { computed, ref } from 'vue'
import type { MapDrawingStroke } from '@/components/map/MapDrawingOverlay.vue'
import type { LngLat } from '@/types/geo'
import type { DrawingPreviewEvent, DrawingPreviewMessage } from '@/types/collaboration'
import type { RealtimeTransport } from './stompTransport'

export type { DrawingPreviewEvent, DrawingPreviewMessage } from '@/types/collaboration'

interface DrawingPreviewChannelOptions {
  tripId: string
  clientId: string
  transport: RealtimeTransport
  throttleMs?: number
  maxCoordinates?: number
  remoteTtlMs?: number
}

export function drawingPreviewSendDestination(tripId: string) {
  return `/app/trips/${encodeURIComponent(tripId)}/map-drawing-preview`
}

export function drawingPreviewTopic(tripId: string) {
  return `/topic/trips/${encodeURIComponent(tripId)}/map-drawings`
}

export function downsampleCoordinates(coordinates: LngLat[], maxCoordinates: number) {
  if (coordinates.length <= maxCoordinates) return [...coordinates]
  if (maxCoordinates <= 1) return [coordinates[0]!]
  const sampled: LngLat[] = []
  for (let index = 0; index < maxCoordinates; index += 1) {
    const sourceIndex = Math.round(index * (coordinates.length - 1) / (maxCoordinates - 1))
    sampled.push(coordinates[sourceIndex]!)
  }
  return sampled
}

export function useDrawingPreviewChannel(options: DrawingPreviewChannelOptions) {
  const throttleMs = options.throttleMs ?? 50
  const maxCoordinates = options.maxCoordinates ?? 32
  const remoteTtlMs = options.remoteTtlMs ?? 10000
  const remoteByKey = ref(new Map<string, MapDrawingStroke>())
  const remoteExpiryTimers = new Map<string, ReturnType<typeof setTimeout>>()
  const remoteSequences = new Map<string, number>()
  let unsubscribe: (() => void) | null = null
  let pendingEvent: DrawingPreviewEvent | null = null
  let throttleTimer: ReturnType<typeof setTimeout> | null = null
  let lastPublishedAt = 0

  const remoteDrawings = computed(() => [...remoteByKey.value.values()])

  function publishNow(event: DrawingPreviewEvent) {
    const payload: DrawingPreviewMessage = {
      ...event,
      tripId: options.tripId,
      clientId: options.clientId,
      coordinates: downsampleCoordinates(event.coordinates, maxCoordinates),
      sentAt: new Date().toISOString(),
    }
    if (options.transport.publish(drawingPreviewSendDestination(options.tripId), payload)) {
      lastPublishedAt = Date.now()
    }
  }

  function publish(event: DrawingPreviewEvent) {
    if (event.phase !== 'UPDATE') {
      if (throttleTimer) clearTimeout(throttleTimer)
      throttleTimer = null
      pendingEvent = null
      publishNow(event)
      return
    }
    const remaining = throttleMs - (Date.now() - lastPublishedAt)
    if (remaining <= 0) {
      publishNow(event)
      return
    }
    pendingEvent = event
    if (throttleTimer) return
    throttleTimer = setTimeout(() => {
      throttleTimer = null
      const next = pendingEvent
      pendingEvent = null
      if (next) publishNow(next)
    }, remaining)
  }

  function isDrawingPreviewMessage(message: unknown): message is DrawingPreviewMessage {
    if (!message || typeof message !== 'object') return false
    const candidate = message as Partial<DrawingPreviewMessage>
    const coordinates = candidate.coordinates
    return typeof candidate.tripId === 'string'
      && typeof candidate.clientId === 'string'
      && typeof candidate.previewId === 'string'
      && typeof candidate.sequence === 'number'
      && Number.isSafeInteger(candidate.sequence)
      && candidate.sequence >= 0
      && (candidate.phase === 'UPDATE' || candidate.phase === 'END' || candidate.phase === 'CANCEL')
      && Array.isArray(coordinates)
      && coordinates.every((coordinate) => (
        typeof coordinate === 'object'
        && coordinate !== null
        && typeof (coordinate as Partial<LngLat>).lng === 'number'
        && Number.isFinite((coordinate as Partial<LngLat>).lng)
        && typeof (coordinate as Partial<LngLat>).lat === 'number'
        && Number.isFinite((coordinate as Partial<LngLat>).lat)
      ))
      && typeof candidate.color === 'string'
      && typeof candidate.width === 'number'
      && Number.isFinite(candidate.width)
      && candidate.width > 0
  }

  function receive(message: unknown) {
    if (!isDrawingPreviewMessage(message)) return
    if (message.tripId !== options.tripId || message.clientId === options.clientId) return
    const key = `${message.clientId}:${message.previewId}`
    if ((remoteSequences.get(key) ?? -1) >= message.sequence) return
    remoteSequences.set(key, message.sequence)
    const expiryTimer = remoteExpiryTimers.get(key)
    if (expiryTimer) clearTimeout(expiryTimer)
    if (message.phase === 'CANCEL') {
      remoteByKey.value.delete(key)
      remoteByKey.value = new Map(remoteByKey.value)
      remoteExpiryTimers.set(key, setTimeout(() => {
        remoteExpiryTimers.delete(key)
        remoteSequences.delete(key)
      }, remoteTtlMs))
      return
    }
    remoteByKey.value.set(key, {
      id: `remote:${key}`,
      coordinates: downsampleCoordinates(message.coordinates, maxCoordinates),
      color: message.color,
      width: message.width,
    })
    remoteByKey.value = new Map(remoteByKey.value)
    remoteExpiryTimers.set(key, setTimeout(() => {
      remoteExpiryTimers.delete(key)
      remoteSequences.delete(key)
      remoteByKey.value.delete(key)
      remoteByKey.value = new Map(remoteByKey.value)
    }, remoteTtlMs))
  }

  function connect() {
    if (!unsubscribe) {
      unsubscribe = options.transport.subscribe<unknown>(drawingPreviewTopic(options.tripId), receive)
    }
    options.transport.connect()
  }

  async function disconnect() {
    unsubscribe?.()
    unsubscribe = null
    if (throttleTimer) clearTimeout(throttleTimer)
    throttleTimer = null
    pendingEvent = null
    remoteExpiryTimers.forEach(clearTimeout)
    remoteExpiryTimers.clear()
    remoteSequences.clear()
    remoteByKey.value = new Map()
    await options.transport.disconnect()
  }

  return { remoteDrawings, publish, connect, disconnect }
}
