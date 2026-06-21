import { computed, ref } from 'vue'
import type { MapDrawingStroke } from '@/components/map/MapDrawingOverlay.vue'
import type { LngLat } from '@/types/geo'
import type { RealtimeTransport } from './stompTransport'

export type DrawingPreviewPhase = 'UPDATE' | 'END' | 'CANCEL'

export interface DrawingPreviewEvent {
  previewId: string
  sequence: number
  phase: DrawingPreviewPhase
  coordinates: LngLat[]
  color: string
  width: number
}

export interface DrawingPreviewMessage extends DrawingPreviewEvent {
  tripId: string
  clientId: string
  sentAt: string
}

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

  function receive(message: DrawingPreviewMessage) {
    if (message.tripId !== options.tripId || message.clientId === options.clientId) return
    const key = `${message.clientId}:${message.previewId}`
    const expiryTimer = remoteExpiryTimers.get(key)
    if (expiryTimer) clearTimeout(expiryTimer)
    if (message.phase === 'CANCEL') {
      remoteExpiryTimers.delete(key)
      remoteByKey.value.delete(key)
      remoteByKey.value = new Map(remoteByKey.value)
      return
    }
    remoteByKey.value.set(key, {
      id: `remote:${key}`,
      coordinates: message.coordinates,
      color: message.color,
      width: message.width,
    })
    remoteByKey.value = new Map(remoteByKey.value)
    remoteExpiryTimers.set(key, setTimeout(() => {
      remoteExpiryTimers.delete(key)
      remoteByKey.value.delete(key)
      remoteByKey.value = new Map(remoteByKey.value)
    }, remoteTtlMs))
  }

  function connect() {
    if (!unsubscribe) {
      unsubscribe = options.transport.subscribe<DrawingPreviewMessage>(drawingPreviewTopic(options.tripId), receive)
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
    remoteByKey.value = new Map()
    await options.transport.disconnect()
  }

  return { remoteDrawings, publish, connect, disconnect }
}
